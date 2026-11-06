'use client';

import { FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { rupees } from '@/lib/format';

/**
 * Stand-in for Razorpay while no keys are configured (local development and
 * demos). Clearly labelled so nobody mistakes it for a real payment.
 */
export function MockCheckout({ order, onPaid, onClose }: { order: { amount: number; shopName: string; description: string }; onPaid: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal aria-label="Test payment">
      <div className="absolute inset-0 animate-fade bg-ink/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-md animate-sheet rounded-t-3xl bg-surface p-6 pb-[max(env(safe-area-inset-bottom),24px)] shadow-sheet sm:rounded-3xl">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
        <div className="flex items-center gap-2 rounded-xl bg-yellow-soft px-3 py-2 text-xs font-semibold text-warn">
          <FlaskConical className="size-4" /> Test mode. No real money is charged.
        </div>
        <p className="mt-5 text-sm text-ink-mute">Paying {order.shopName}</p>
        <p className="mt-1 font-mono text-4xl font-bold tabular">{rupees(order.amount)}</p>
        <p className="mt-1 text-sm text-ink-mute">{order.description}</p>
        <div className="mt-6 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-ink-soft">
          {['UPI', 'Card', 'Netbanking'].map((m, i) => (
            <div key={m} className={i === 0 ? 'rounded-xl border-2 border-ink py-3 text-ink' : 'rounded-xl border border-line py-3'}>
              {m}
            </div>
          ))}
        </div>
        <Button
          size="xl"
          className="mt-6 w-full"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onPaid();
            } finally {
              setBusy(false);
            }
          }}
        >
          Pay {rupees(order.amount)}
        </Button>
        <button onClick={onClose} className="mt-3 w-full py-2 text-sm font-semibold text-ink-mute hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
