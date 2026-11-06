import type { Metadata } from 'next';
import { JobTracker } from './job-tracker';

export const metadata: Metadata = { title: 'Your print', robots: { index: false } };

export default async function JobPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  return <JobTracker jobRef={ref} />;
}
