// How a shop's SeedhaPrint subscription reads in the admin panel and the shop dashboard.
// The state itself is worked out by the API (apps/api/src/subscription.ts).

export type PlanState = 'free' | 'active' | 'due_soon' | 'grace' | 'off';

export interface Plan {
  state: PlanState;
  fee: number;
  paidUntil: string | null;
  graceUntil: string | null;
  daysLeft: number | null;
}

export interface PlanPayment {
  at: string;
  amount: number;
  months: number;
  method: 'upi' | 'cash' | 'bank' | 'other';
  note?: string;
  until?: string;
}

export const PLAN_LABEL: Record<PlanState, string> = {
  free: 'Free',
  active: 'Paid',
  due_soon: 'Due soon',
  grace: 'Overdue',
  off: 'Switched off',
};

export const PLAN_TONE: Record<PlanState, 'neutral' | 'ok' | 'warn' | 'bad' | 'magenta'> = {
  free: 'neutral',
  active: 'ok',
  due_soon: 'warn',
  grace: 'magenta',
  off: 'bad',
};

export const METHOD_LABEL: Record<PlanPayment['method'], string> = { upi: 'UPI', cash: 'Cash', bank: 'Bank', other: 'Other' };

/** "12 Dec 2026" in India time. */
export const planDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '';

/** YYYY-MM-DD in India time, for date inputs. */
export const planDateInput = (iso?: string | null) =>
  iso ? new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10) : '';
