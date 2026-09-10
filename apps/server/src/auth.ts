import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import mongoose from 'mongoose';
import { User } from './models.js';

export function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export interface AuthedRequest extends Request {
  userId: string;
}

const credsSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
});

export async function register(req: Request, res: Response) {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
  }
  const email = parsed.data.email.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'Email already registered' } });
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await User.create({ email, passwordHash });
  req.session.userId = user._id.toString();
  return res.status(201).json({ user: { id: user._id.toString(), email: user.email } });
}

export async function login(req: Request, res: Response) {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
  }
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
  }
  req.session.userId = user._id.toString();
  return res.json({ user: { id: user._id.toString(), email: user.email } });
}

export async function logout(req: Request, res: Response) {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
}

export async function me(req: Request, res: Response) {
  if (!req.session.userId) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not logged in' } });
  }
  const user = await User.findById(req.session.userId).select('email');
  if (!user) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid session' } });
  }
  return res.json({ user: { id: user._id.toString(), email: user.email } });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
  }
  (req as AuthedRequest).userId = req.session.userId;
  next();
}
