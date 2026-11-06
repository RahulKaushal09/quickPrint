// Job lifecycle. A job moves strictly forward through these states; the API
// refuses any transition that isn't listed in NEXT.
//
//   draft ──pay──▶ queued ──agent picks up──▶ sent ──▶ printing ──▶ printed
//     │                │                        │          │
//     ▼                └──────────┬─────────────┴──────────┘
//   expired                       ▼
//                              failed ──▶ refunded

export const JOB_STATUSES = [
  'draft', // file uploaded and priced, waiting for payment
  'queued', // paid, waiting for the shop PC
  'sent', // delivered to the shop PC, not yet confirmed printing
  'printing', // the shop PC has handed it to the printer
  'printed', // printer accepted every copy
  'failed', // could not print (shop marked it, or the agent reported an error)
  'refunded', // money returned to the customer
  'expired', // never paid
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

const NEXT: Record<JobStatus, readonly JobStatus[]> = {
  draft: ['queued', 'expired'],
  queued: ['sent', 'failed'],
  sent: ['queued', 'printing', 'printed', 'failed'], // back to queued when the PC drops before confirming
  printing: ['printed', 'failed'],
  printed: ['failed'], // shop can still report a bad print
  failed: ['queued', 'refunded'], // retry, or give the money back
  refunded: [],
  expired: [],
};

export function canMove(from: JobStatus, to: JobStatus): boolean {
  return NEXT[from].includes(to);
}

/** States where the customer has paid and the shop owes them a print or a refund. */
export const OPEN_STATUSES: readonly JobStatus[] = ['queued', 'sent', 'printing'];
export const PAID_STATUSES: readonly JobStatus[] = ['queued', 'sent', 'printing', 'printed', 'failed', 'refunded'];

export const STATUS_LABEL: Record<JobStatus, string> = {
  draft: 'Awaiting payment',
  queued: 'Waiting for printer',
  sent: 'Sent to printer',
  printing: 'Printing',
  printed: 'Printed',
  failed: 'Failed',
  refunded: 'Refunded',
  expired: 'Expired',
};

export type ColorMode = 'bw' | 'color';

export const COLOR_LABEL: Record<ColorMode, string> = { bw: 'Black & white', color: 'Colour' };
