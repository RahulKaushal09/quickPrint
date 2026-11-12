// Job lifecycle. A job moves strictly forward through these states; the API
// refuses any transition that isn't listed in NEXT.
//
//   draft ──pay──▶ queued ──agent picks up──▶ sent ──▶ printing ──▶ printed
//     │                │                        │          │
//     ▼                └──────────┬─────────────┴──────────┘
//   expired                       ▼
//     ▲                        failed ──▶ refunded
//     │
//   awaiting_cash ──shop takes the cash──▶ queued   (reached from draft)

export const JOB_STATUSES = [
  'draft', // file uploaded and priced, waiting for payment
  'awaiting_cash', // customer will pay cash; printing waits for the shop to accept it
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
  draft: ['queued', 'awaiting_cash', 'expired'],
  awaiting_cash: ['queued', 'expired'],
  queued: ['sent', 'failed'],
  sent: ['queued', 'printing', 'printed', 'failed'], // back to queued when the PC drops before confirming
  printing: ['printed', 'failed'],
  printed: ['failed', 'queued'], // shop can still report a bad print, or print it again
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
  awaiting_cash: 'Collect cash',
  queued: 'Waiting for printer',
  sent: 'Sent to printer',
  printing: 'Printing',
  printed: 'Printed',
  failed: 'Failed',
  refunded: 'Refunded',
  expired: 'Expired',
};

export type ColorMode = 'bw' | 'color';
export type Sides = 'single' | 'double';
export type PaymentMethod = 'online' | 'cash';

/** One page to print: its number in the uploaded document and its clockwise turn on the sheet. */
export interface PageChoice {
  p: number;
  r: 0 | 90 | 180 | 270;
}

export const SIDES_LABEL: Record<Sides, string> = { single: 'Single side', double: 'Both sides' };

/** Paper used by one copy. */
export const sheetsFor = (pages: number, sides: Sides) => (sides === 'double' ? Math.ceil(pages / 2) : pages);

export const COLOR_LABEL: Record<ColorMode, string> = { bw: 'Black & white', color: 'Colour' };
