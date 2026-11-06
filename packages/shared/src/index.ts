export * from './jobs';
export * from './pricing';
export * from './protocol';

export const BRAND = {
  name: 'QuickPrint',
  tagline: 'Scan. Upload. Pick up.',
} as const;

/** Codes people read aloud or type: no 0/O, 1/I/L. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
