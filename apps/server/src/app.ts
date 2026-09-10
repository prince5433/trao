import MongoStore from 'connect-mongo';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import mongoose from 'mongoose';
import { login, logout, me, register } from './auth.js';
import { config } from './config.js';
import { kitsRouter } from './routes/kits.js';

export function createApp(options?: { mongoUri?: string; useMemorySession?: boolean }) {
  const app = express();
  const mongoUri = options?.mongoUri ?? config.mongoUri;
  app.set('trust proxy', 1);
  app.use(
    cors({
      origin: config.clientOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  const sessionOpts: session.SessionOptions = {
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: config.isProd ? 'none' : 'lax',
      secure: config.isProd,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  };

  if (!options?.useMemorySession) {
    sessionOpts.store = MongoStore.create({
      mongoUrl: mongoUri,
      ttl: 60 * 60 * 24 * 7,
    });
  }

  app.use(session(sessionOpts));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mongo: mongoose.connection.readyState === 1 });
  });

  app.post('/api/auth/register', register);
  app.post('/api/auth/login', login);
  app.post('/api/auth/logout', logout);
  app.get('/api/auth/me', me);
  app.use('/api/kits', kitsRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({
      error: {
        code: 'INTERNAL',
        message: err instanceof Error ? err.message : 'Internal error',
      },
    });
  });

  return app;
}

export async function connectDb(uri = config.mongoUri) {
  await mongoose.connect(uri);
}
