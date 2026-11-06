import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { User } from './models';

export interface Session {
  userId: string;
  role: 'admin' | 'owner';
  shopId?: string;
}

declare global {
  namespace Express {
    interface Request {
      session?: Session;
      /** The shop this request acts on (owner: their own; admin: X-Shop-Id header). */
      shopId?: string;
    }
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function signSession(s: Session): string {
  return jwt.sign(s, config.jwtSecret, { expiresIn: '30d' });
}

export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try {
    const s = jwt.verify(token, config.jwtSecret) as Session;
    // Re-read the user so a deleted account or a role change takes effect immediately.
    const user = await User.findById(s.userId).select('role shopId').lean();
    if (!user) throw new Error();
    req.session = { userId: s.userId, role: user.role, shopId: user.shopId ? String(user.shopId) : undefined };
    next();
  } catch {
    next(new HttpError(401, 'Please sign in again'));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.session?.role !== 'admin') return next(new HttpError(403, 'Admins only'));
  next();
}

export function requireShop(req: Request, _res: Response, next: NextFunction) {
  const s = req.session!;
  const id = s.role === 'admin' ? String(req.headers['x-shop-id'] || '') : s.shopId;
  if (!id) return next(new HttpError(400, 'No shop selected'));
  req.shopId = id;
  next();
}
