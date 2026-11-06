'use client';

import { Inbox, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { JobList, type ShopJob } from '@/components/job-list';
import { Button, Card, Empty, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { cx } from '@/lib/format';

const TABS = [
  { key: 'active', label: 'In progress' },
  { key: 'done', label: 'Printed' },
  { key: 'issues', label: 'Issues' },
  { key: 'all', label: 'All' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const EMPTY: Record<Tab, string> = {
  active: 'Nothing is printing right now.',
  done: 'Printed jobs appear here.',
  issues: 'No failed or refunded jobs. Nice.',
  all: 'No jobs yet. Share your QR to get the first one.',
};

export default function JobsPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [jobs, setJobs] = useState<ShopJob[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (t: Tab) => {
    const r = await api<{ jobs: ShopJob[] }>(`/api/shop/jobs?status=${t}&limit=40`);
    setJobs(r.jobs);
    setMore(r.jobs.length === 40);
  }, []);

  useEffect(() => {
    setJobs(null);
    void load(tab).catch(() => setJobs([]));
    // Live refresh of the first page; older pages stay as loaded.
    const t = setInterval(() => !document.hidden && load(tab).catch(() => {}), 6000);
    return () => clearInterval(t);
  }, [tab, load]);

  async function loadMore() {
    if (!jobs?.length) return;
    setLoadingMore(true);
    try {
      const r = await api<{ jobs: ShopJob[] }>(`/api/shop/jobs?status=${tab}&limit=40&before=${encodeURIComponent(jobs[jobs.length - 1]!.createdAt)}`);
      setJobs([...jobs, ...r.jobs]);
      setMore(r.jobs.length === 40);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Every paid print, newest first. Match the pickup code with the customer."
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="size-4" />} onClick={() => load(tab)}>
            Refresh
          </Button>
        }
      />
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-2xl bg-paper-2 p-1 sm:inline-flex">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cx('whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition', tab === t.key ? 'bg-surface text-ink shadow-card' : 'text-ink-mute hover:text-ink')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Card className="px-5 sm:px-6">
        {!jobs ? (
          <div className="space-y-3 py-5">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : jobs.length ? (
          <>
            <JobList jobs={jobs} onChange={(j) => setJobs((all) => all!.map((x) => (x.id === j.id ? j : x)))} />
            {more && (
              <div className="border-t border-line py-4 text-center">
                <Button variant="ghost" size="sm" loading={loadingMore} onClick={loadMore}>
                  Load older jobs
                </Button>
              </div>
            )}
          </>
        ) : (
          <Empty icon={<Inbox className="size-6" />} title="Nothing here">
            {EMPTY[tab]}
          </Empty>
        )}
      </Card>
    </>
  );
}
