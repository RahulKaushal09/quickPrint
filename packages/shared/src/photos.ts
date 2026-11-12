// Passport photos: sizes, papers and how many fit on a sheet. The customer's
// preview and the server's print file both use photoLayout, so they match.

export const PHOTO_SIZES = {
  '35x45': { w: 35, h: 45, label: 'Passport, 35 × 45 mm' },
  '51x51': { w: 51, h: 51, label: '2 × 2 inch, 51 × 51 mm' },
} as const;

export const PHOTO_PAPERS = {
  '4x6': { w: 101.6, h: 152.4, label: '4 × 6 inch photo paper' },
  A4: { w: 210, h: 297, label: 'A4 photo paper' },
} as const;

export type PhotoSize = keyof typeof PHOTO_SIZES;
export type PhotoPaper = keyof typeof PHOTO_PAPERS;

/** Most printers can't print closer than about 3 mm to the edge. Gaps leave room to cut. */
const MARGIN = 3;
const GAP = 2;

export interface PhotoSlot {
  /** Millimetres from the sheet's top-left corner. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The photo is turned sideways in this slot to fit more on the sheet. */
  turned: boolean;
}

function grid(paper: { w: number; h: number }, cw: number, ch: number) {
  const cols = Math.max(0, Math.floor((paper.w - 2 * MARGIN + GAP) / (cw + GAP)));
  const rows = Math.max(0, Math.floor((paper.h - 2 * MARGIN + GAP) / (ch + GAP)));
  return { cols, rows, fits: cols * rows };
}

/** The most photos of this size one sheet holds, upright or turned sideways. */
export function photosPerSheet(paper: PhotoPaper, size: PhotoSize): number {
  const p = PHOTO_PAPERS[paper];
  const s = PHOTO_SIZES[size];
  return Math.max(grid(p, s.w, s.h).fits, grid(p, s.h, s.w).fits);
}

/** Where each of `count` photos goes on the upright sheet, centred as a block. */
export function photoLayout(paper: PhotoPaper, size: PhotoSize, count: number): { page: { w: number; h: number }; slots: PhotoSlot[] } {
  const p = PHOTO_PAPERS[paper];
  const s = PHOTO_SIZES[size];
  const upright = grid(p, s.w, s.h);
  const sideways = grid(p, s.h, s.w);
  // Upright when it holds enough; sideways only to fit more (8 instead of 6 on 4x6 paper).
  const turned = upright.fits < count && sideways.fits > upright.fits;
  const g = turned ? sideways : upright;
  const [cw, ch] = turned ? [s.h, s.w] : [s.w, s.h];
  const n = Math.min(count, g.fits);
  const cols = Math.min(g.cols, n);
  const rows = Math.ceil(n / Math.max(1, cols));
  const x0 = (p.w - (cols * cw + (cols - 1) * GAP)) / 2;
  const y0 = (p.h - (rows * ch + (rows - 1) * GAP)) / 2;
  const slots: PhotoSlot[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    slots.push({ x: x0 + c * (cw + GAP), y: y0 + r * (ch + GAP), w: cw, h: ch, turned });
  }
  return { page: { w: p.w, h: p.h }, slots };
}
