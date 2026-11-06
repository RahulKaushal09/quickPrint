// All money is integer paise. Rates are per printed side of A4.

import type { ColorMode } from './jobs';

export interface RateCard {
  bwPerPage: number;
  colorPerPage: number;
  colorEnabled: boolean;
}

export interface PlatformFee {
  /** 'percent' value is basis points (250 = 2.5%), 'flat' value is paise per job. */
  type: 'percent' | 'flat';
  value: number;
}

export interface Quote {
  pages: number;
  copies: number;
  sheets: number;
  rate: number;
  total: number;
}

export const LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxPages: 300,
  maxCopies: 50,
  /** Razorpay will not create an order below ₹1. */
  minTotal: 100,
} as const;

export function quote(card: RateCard, mode: ColorMode, pages: number, copies: number): Quote {
  if (!Number.isInteger(pages) || pages < 1) throw new Error('Document has no pages');
  if (pages > LIMITS.maxPages) throw new Error(`Documents are limited to ${LIMITS.maxPages} pages`);
  if (!Number.isInteger(copies) || copies < 1 || copies > LIMITS.maxCopies) {
    throw new Error(`Copies must be between 1 and ${LIMITS.maxCopies}`);
  }
  if (mode === 'color' && !card.colorEnabled) throw new Error('This shop does not print in colour');
  const rate = mode === 'color' ? card.colorPerPage : card.bwPerPage;
  const sheets = pages * copies;
  return { pages, copies, sheets, rate, total: Math.max(LIMITS.minTotal, sheets * rate) };
}

/** What the platform keeps from a job. Never more than the job total. */
export function platformCut(total: number, fee: PlatformFee): number {
  const cut = fee.type === 'percent' ? Math.round((total * fee.value) / 10_000) : fee.value;
  return Math.min(total, Math.max(0, cut));
}

export function rupees(paise: number): string {
  const r = paise / 100;
  return '₹' + (Number.isInteger(r) ? r.toLocaleString('en-IN') : r.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}
