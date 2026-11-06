// Job state changes. Every change is a single conditional update on the
// current status, so two servers (or a webhook racing the checkout callback)
// can never both apply the same step.

import crypto from 'node:crypto';
import { canMove, CODE_ALPHABET, JOB_STATUSES, type JobStatus } from '@seedhaprint/shared';
import { Job, type JobDoc } from './models';
import { HttpError } from './auth';
import { RazorpayError, refund, shopKeys } from './payments';

export function randomCode(len: number, alphabet = CODE_ALPHABET): string {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export const newJobRef = () => randomCode(16, 'abcdefghijkmnpqrstuvwxyz23456789');

/**
 * Move a job to `to` if it is currently in a state that may move there.
 * Returns the updated job, or null if someone else already moved it.
 */
export async function transition(
  jobId: unknown,
  to: JobStatus,
  opts: { note?: string; set?: Record<string, unknown>; only?: JobStatus[]; filter?: Record<string, unknown> } = {},
): Promise<JobDoc | null> {
  const from = (opts.only ?? JOB_STATUSES.filter((s) => canMove(s, to))) as JobStatus[];
  return Job.findOneAndUpdate(
    { _id: jobId, status: { $in: from }, ...opts.filter },
    { $set: { status: to, ...opts.set }, $push: { events: { at: new Date(), status: to, note: opts.note ?? '' } } },
    { new: true },
  );
}

/** Called by both the checkout callback and the webhook; only the first one wins. */
export async function markPaid(job: JobDoc, paymentId: string): Promise<JobDoc | null> {
  return transition(job._id, 'queued', {
    only: ['draft', 'expired'], // a payment that lands just after expiry still counts
    note: 'Payment received',
    set: { 'payment.paymentId': paymentId, 'payment.paidAt': new Date() },
  });
}

export async function refundJob(job: JobDoc, note: string): Promise<JobDoc | null> {
  if (job.status !== 'failed') return null;
  let refundId = '';
  if (job.payment?.paymentId && !job.payment.mock) {
    const keys = await shopKeys(job.shopId);
    if (!keys) throw new HttpError(409, 'Connect your Razorpay account again to refund this job');
    try {
      refundId = await refund(keys, job.payment.paymentId, job.total);
    } catch (e) {
      if (e instanceof RazorpayError) throw new HttpError(502, `Razorpay could not refund: ${e.message}`);
      throw e;
    }
  }
  return transition(job._id, 'refunded', { only: ['failed'], note, set: { 'payment.refundId': refundId } });
}
