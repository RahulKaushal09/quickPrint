// Monthly subscriptions. A shop's state is worked out from its fee and
// "paid until" date every time it is needed, so recording a payment switches
// a shop back on at once and nothing has to run on a timer.
//
//   fee 0                            free, never switches off
//   more than 5 days left            active
//   5 days or less left              due_soon   (owner sees a reminder)
//   past the date, within grace      grace      (still works, owner warned)
//   past grace                       off        (customers can't order)

export type SubscriptionState = 'free' | 'active' | 'due_soon' | 'grace' | 'off';

export const DUE_SOON_DAYS = 5;
const DAY = 86400_000;

export interface SubscriptionInfo {
  state: SubscriptionState;
  fee: number;
  paidUntil: Date | null;
  /** The last day the shop keeps working without paying. */
  graceUntil: Date | null;
  /** Whole days until paidUntil; negative once it has passed. */
  daysLeft: number | null;
}

export function subscriptionState(sub: { fee?: number | null; paidUntil?: Date | null } | null | undefined, graceDays: number, now = new Date()): SubscriptionInfo {
  const fee = sub?.fee ?? 0;
  if (!fee) return { state: 'free', fee: 0, paidUntil: sub?.paidUntil ?? null, graceUntil: null, daysLeft: null };
  const paidUntil = sub?.paidUntil ?? null;
  if (!paidUntil) return { state: 'off', fee, paidUntil: null, graceUntil: null, daysLeft: null };
  const graceUntil = new Date(paidUntil.getTime() + graceDays * DAY);
  const daysLeft = Math.ceil((paidUntil.getTime() - now.getTime()) / DAY);
  const state: SubscriptionState = now > graceUntil ? 'off' : now > paidUntil ? 'grace' : daysLeft <= DUE_SOON_DAYS ? 'due_soon' : 'active';
  return { state, fee, paidUntil, graceUntil, daysLeft };
}

/** The end of that day in India, so a plan runs for the whole of its last day. */
export function endOfDayIST(d: Date): Date {
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  ist.setUTCHours(23, 59, 59, 999);
  return new Date(ist.getTime() - 5.5 * 3600_000);
}

/**
 * A payment adds whole months. Paying early adds to the current end date;
 * paying after it ran out counts from today, so nobody pays for days they were off.
 */
export function extendPaidUntil(current: Date | null | undefined, months: number, now = new Date()): Date {
  const from = current && current > now ? current : now;
  const next = new Date(from.getTime() + 5.5 * 3600_000); // calendar maths on the Indian date
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay)); // 31 Jan + 1 month = 28/29 Feb
  return endOfDayIST(new Date(next.getTime() - 5.5 * 3600_000));
}
