import type { Metadata } from 'next';
import { API_URL } from '@/lib/api';
import { CustomerFlow } from './customer-flow';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  try {
    const res = await fetch(`${API_URL}/api/public/shops/${code}`, { next: { revalidate: 300 } });
    if (res.ok) {
      const shop = await res.json();
      return { title: `Print at ${shop.name}`, description: `Upload a document and print it at ${shop.name}${shop.area ? ', ' + shop.area : ''}.` };
    }
  } catch {}
  return { title: 'Print your document' };
}

export default async function ShopPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <CustomerFlow code={code.toUpperCase()} />;
}
