'use client';

import { createContext, useContext } from 'react';
import type { PhotoPaper, PhotoSize } from '@seedhaprint/shared';
import type { Plan, PlanPayment } from '@/lib/plan';

/** The owner's own settings for one printer. sides '' = follow what Windows says. */
export interface PrinterSetting {
  printer: string;
  label: string;
  sides: '' | 'auto' | 'manual' | 'off';
  reverseBacks: boolean;
}

/** A printer's trays in order of preference. */
export interface TrayOrder {
  printer: string;
  docs: string[];
  photos: string[];
}

export interface ShopData {
  _id: string;
  code: string;
  name: string;
  area: string;
  city: string;
  phone: string;
  active: boolean;
  accepting: boolean;
  rates: { bwPerPage: number; colorPerPage: number; colorEnabled: boolean; duplexEnabled: boolean };
  printers: { bw: string[]; color: string[]; duplex: string[]; photo: string[] };
  trays: TrayOrder[];
  printerSettings: PrinterSetting[];
  cash: { enabled: boolean; autoPrint: boolean };
  photos: { enabled: boolean; size: PhotoSize; paper: PhotoPaper; perSheet: number; price: number };
  subscription: { fee: number; paidUntil?: string; payments: PlanPayment[] };
  razorpay: { keyId: string };
}

export interface ShopCtx {
  shop: ShopData;
  user: { name: string; phone: string; role: 'admin' | 'owner' };
  qrUrl: string;
  subscription: Plan;
  setShop: (s: ShopData) => void;
}

export const ShopContext = createContext<ShopCtx | null>(null);

export function useShop(): ShopCtx {
  const c = useContext(ShopContext);
  if (!c) throw new Error('useShop outside dashboard');
  return c;
}
