import http from 'node:http';
import mongoose from 'mongoose';
import { WebSocketServer } from 'ws';
import { config, paymentsLive } from './config';
import { createApp } from './app';
import { attach, authenticate } from './hub';
import { transition } from './jobs';
import { Job } from './models';
import { storage } from './storage';

await mongoose.connect(config.mongoUri);
await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()));

const server = http.createServer(createApp());
const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
attach(wss);

server.on('upgrade', async (req, socket, head) => {
  if (!req.url?.startsWith('/api/agent/ws')) return socket.destroy();
  const device = await authenticate(req).catch(() => null);
  if (!device) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, device));
});

// Housekeeping: expire unpaid drafts and delete customer files once they're no longer needed.
async function cleanup() {
  const draftCutoff = new Date(Date.now() - config.draftTtlMinutes * 60_000);
  for (const j of await Job.find({ status: 'draft', createdAt: { $lt: draftCutoff } }).select('_id').limit(500)) {
    await transition(j._id, 'expired', { only: ['draft'], note: 'Not paid in time' });
  }
  const fileCutoff = new Date(Date.now() - config.fileRetentionHours * 3600_000);
  const done = await Job.find({
    'file.key': { $ne: '' },
    $or: [{ status: 'expired' }, { status: { $in: ['printed', 'refunded'] }, updatedAt: { $lt: fileCutoff } }],
  })
    .select('file.key')
    .limit(500);
  for (const j of done) {
    await storage.remove(j.file.key!).catch(() => {});
    await Job.updateOne({ _id: j._id }, { 'file.key': '', 'file.deletedAt': new Date() });
  }
}
setInterval(() => void cleanup().catch((e) => console.error('[cleanup]', e)), 5 * 60_000).unref();
void cleanup();

server.listen(config.port, () => {
  console.log(`SeedhaPrint API on :${config.port} (payments: ${paymentsLive ? 'Razorpay' : 'mock'}, files: ${config.s3 ? 'S3' : 'local disk'})`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close();
    void mongoose.disconnect().finally(() => process.exit(0));
  });
}
