import express, { Express } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { Pool } from 'pg';
import { Config } from './config';
import { Logger } from './logger';
import { buildSessionMiddleware } from './lib/session';
import { csrfProtection, CSRF_COOKIE_NAME } from './middleware/csrf';
import { createLoginRateLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { controlsRouter } from './routes/controls';
import { assignmentsRouter } from './routes/assignments';
import { attentionRouter } from './routes/attention';
import { auditRouter } from './routes/audit';
import { invitationsRouter } from './routes/invitations';
import { adminRouter } from './routes/admin';
import { usersRouter } from './routes/users';
import { importsRouter } from './routes/imports';
import { aiReviewRouter } from './routes/aiReview';
import { AiReviewClient, createOpenAiReviewClient } from './lib/aiClient';

export interface AppDeps {
  /** Injectable AI client so tests never call the real OpenAI API. */
  aiClient?: AiReviewClient;
}

export function buildApp(config: Config, pool: Pool, log: Logger, deps: AppDeps = {}): Express {
  const app = express();

  // Railway terminates TLS at its proxy; trust exactly one hop so req.ip and
  // secure-cookie detection work without trusting arbitrary client headers.
  if (config.nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Request logging: method, path and status only. Bodies, headers and query
  // strings are never logged — they can contain credentials and content.
  app.use(
    pinoHttp({
      logger: log,
      autoLogging: { ignore: (req) => req.url === '/health' },
      serializers: {
        req: (req: { method: string; url: string }) => ({
          method: req.method,
          path: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    })
  );

  // Minimal CORS: only the configured frontend origin, with credentials.
  // In the reference deployment the frontend proxies /api same-origin through
  // Vercel, so this only matters for direct-origin setups and local dev.
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && origin === config.frontendUrl) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-csrf-token');
        res.status(204).end();
        return;
      }
    }
    next();
  });

  app.use(healthRouter(pool, log));

  app.use(buildSessionMiddleware(config, pool));
  app.use(csrfProtection(config.nodeEnv));

  /** Bootstrap endpoint: ensures the CSRF cookie is set and returns its value. */
  app.get('/api/csrf', (req, res) => {
    res.json({ csrfToken: req.cookies[CSRF_COOKIE_NAME] });
  });

  const loginRateLimiter = createLoginRateLimiter(log);
  app.use('/api', authRouter(pool, log, loginRateLimiter));
  app.use('/api', controlsRouter(pool, log));
  app.use('/api', assignmentsRouter(pool, log));
  app.use('/api', attentionRouter(pool));
  app.use('/api', auditRouter(pool));
  app.use('/api', invitationsRouter(pool, log));
  app.use('/api', adminRouter(pool));
  app.use('/api', usersRouter(pool));
  app.use('/api', importsRouter(pool, log));

  const aiClient =
    deps.aiClient ?? (config.aiFeatureEnabled ? createOpenAiReviewClient(config) : null);
  app.use('/api', aiReviewRouter(config, pool, log, aiClient));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler(log, config.nodeEnv));

  return app;
}
