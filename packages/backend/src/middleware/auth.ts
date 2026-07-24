import { Request, Response, NextFunction, RequestHandler } from 'express';

export type Role = 'admin' | 'manager' | 'employee';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    organisationId: string;
    role: Role;
  }
}

/**
 * Requires an authenticated session. The organisation ID used by every
 * downstream handler comes from this server-side session — a client-supplied
 * organisation ID is never trusted.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId || !req.session.organisationId || !req.session.role) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    if (!req.session.userId || !req.session.role) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.session.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
