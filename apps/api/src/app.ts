import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { MulterError } from 'multer';
import { z, ZodError } from 'zod';
import { HttpError, signSession } from './auth';
import { config } from './config';
import { DocumentError } from './documents';
import { dispatchShop } from './hub';
import { markPaid } from './jobs';
import { Job, User } from './models';
import { webhookSignatureValid } from './payments';
import { adminRoutes } from './routes/admin';
import { agentRoutes } from './routes/agent';
import { publicRoutes } from './routes/public';
import { shopRoutes } from './routes/shop';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: [config.webUrl], credentials: false }));

  // Razorpay webhook needs the raw body for its signature, so it goes before express.json().
  app.post('/api/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    if (!webhookSignatureValid(req.body, String(req.headers['x-razorpay-signature'] || ''))) {
      return res.status(400).json({ error: 'Bad signature' });
    }
    const event = JSON.parse(req.body.toString('utf8'));
    const p = event?.payload?.payment?.entity;
    if ((event.event === 'payment.captured' || event.event === 'order.paid') && p?.order_id) {
      const job = await Job.findOne({ 'payment.orderId': p.order_id });
      if (job && p.amount === job.total && (await markPaid(job, p.id))) await dispatchShop(String(job.shopId));
    }
    res.json({ ok: true });
  });

  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60_000, limit: 30 }), async (req, res) => {
    const { phone, password } = z.object({ phone: z.string().trim(), password: z.string() }).parse(req.body);
    const user = await User.findOne({ phone });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Wrong phone number or password');
    const token = signSession({ userId: String(user._id), role: user.role, shopId: user.shopId ? String(user.shopId) : undefined });
    res.json({ token, user: { name: user.name, phone: user.phone, role: user.role, shopId: user.shopId } });
  });

  app.use('/api/public', publicRoutes);
  app.use('/api/shop', shopRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/agent', agentRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof DocumentError) return res.status(422).json({ error: err.message });
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' });
    if (err instanceof MulterError) {
      return res.status(413).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 25 MB.' : 'Upload one file at a time.' });
    }
    if ((err as any)?.name === 'CastError') return res.status(404).json({ error: 'Not found' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
