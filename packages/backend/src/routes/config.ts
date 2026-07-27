import { Router } from 'express';
import { Config } from '../config';

/**
 * Public client configuration. Deliberately unauthenticated and mounted
 * before the session middleware: the frontend needs it on first paint,
 * before anyone has logged in.
 *
 * Only deployment-shaped booleans belong here — never secrets, connection
 * details, or anything organisation-specific. Per-organisation settings
 * (such as whether AI review is enabled) stay behind authenticated,
 * organisation-scoped routes.
 */
export function configRouter(config: Config): Router {
  const router = Router();

  router.get('/api/config', (_req, res) => {
    res.json({ demoMode: config.demoMode });
  });

  return router;
}
