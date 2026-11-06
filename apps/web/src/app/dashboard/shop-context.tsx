'use client';

import { createContext, useContext } from 'react';

export interface ShopData {
  _id: string;
  code: string;
  name: string;
  area: string;
  city: string;
  phone: string;
  active: boolean;
  accepting: boolean;
  rates: { bwPerPage: number; colorPerPage: number; colorEnabled: boolean };
  printers: { bw: string[]; color: string[] };
  razorpay: { keyId: string };
}

export interface ShopCtx {
  shop: ShopData;
  user: { name: string; phone: string; role: 'admin' | 'owner' };
  qrUrl: string;
  setShop: (s: ShopData) => void;
}

export const ShopContext = createContext<ShopCtx | null>(null);

export function useShop(): ShopCtx {
  const c = useContext(ShopContext);
  if (!c) throw new Error('useShop outside dashboard');
  return c;
}
