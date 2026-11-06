import { ImageResponse } from 'next/og';

export const alt = 'SeedhaPrint: QR printing for print shops';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0b1220', color: '#fff', padding: 80, position: 'relative' }}>
      <div style={{ display: 'flex', fontSize: 34, fontWeight: 800 }}>SeedhaPrint</div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', fontSize: 104, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3 }}>
        <span>Phone se</span>
        <span>seedha print.</span>
      </div>
      <div style={{ display: 'flex', marginTop: 28, fontSize: 34, color: 'rgba(255,255,255,0.65)' }}>One QR at your counter. Customers upload, pay and it prints.</div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, height: 16 }}>
        <div style={{ flex: 1, background: '#00a3e0' }} />
        <div style={{ flex: 1, background: '#e5007d' }} />
        <div style={{ flex: 1, background: '#ffd200' }} />
      </div>
    </div>,
    size,
  );
}
