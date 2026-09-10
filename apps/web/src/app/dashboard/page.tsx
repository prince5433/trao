'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type KitSummary } from '@/lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const [kits, setKits] = useState<KitSummary[] | null>(null);
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>(
    'checking',
  );
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ user: { email: string } }>('/api/auth/me')
      .then(() => {
        setAuthState('authenticated');
        return api<{ kits: KitSummary[] }>('/api/kits');
      })
      .then((data) => setKits(data.kits))
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Request failed';
        setError(message);
        setAuthState((prev) => (prev === 'checking' ? 'unauthenticated' : prev));
        const lower = message.toLowerCase();
        if (lower.includes('auth') || lower.includes('log')) router.push('/login');
      });
  }, [router]);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  if (authState === 'checking' || (authState === 'authenticated' && kits === null && !error)) {
    return <p className="text-ink/60">Loading your kits…</p>;
  }

  if (authState === 'authenticated' && kits === null && error) {
    return (
      <EmptyState
        title="Could not load kits"
        body={error}
        actionLabel="Try again"
        href="/dashboard"
      />
    );
  }

  if (authState === 'unauthenticated') {
    return (
      <EmptyState
        title="Sign in required"
        body={error || 'Not logged in'}
        actionLabel="Go to login"
        href="/login"
      />
    );
  }

  if (!kits) {
    return <p className="text-ink/60">Loading your kits…</p>;
  }

  if (kits.length === 0) {
    return (
      <EmptyState
        title="No kits yet"
        body="Create your first interview prep kit from a job description and company URL."
        actionLabel="Create a kit"
        href="/create"
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-moss">Your kits</h1>
          <p className="text-ink/70">Reopen, edit, and practice anytime.</p>
        </div>
        <div className="flex gap-2">
          <a href="/create" className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white">
            New kit
          </a>
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-moss/20 px-4 py-2 text-sm font-semibold"
          >
            Log out
          </button>
        </div>
      </div>
      <ul className="grid gap-4 md:grid-cols-2">
        {kits.map((kit) => (
          <li key={kit.id}>
            <a
              href={`/kits/${kit.id}`}
              className="block rounded-2xl border border-moss/10 bg-white/80 p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-leaf/40"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-xl text-moss">
                  {kit.company || kit.role || 'Untitled kit'}
                </h2>
                <StatusPill status={kit.status} />
              </div>
              <p className="mt-1 text-sm text-ink/70">{kit.role || 'Role pending'}</p>
              <p className="mt-3 truncate text-xs text-ink/50">{kit.company_url}</p>
              <p className="mt-1 text-xs text-ink/50">{kit.days} days · updated {new Date(kit.updatedAt).toLocaleString()}</p>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ready: 'bg-leaf/15 text-moss',
    partial: 'bg-ember/15 text-ember',
    generating: 'bg-mist text-moss',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-sand text-ink/70',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors[status] || colors.pending}`}>
      {status}
    </span>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  href,
}: {
  title: string;
  body: string;
  actionLabel: string;
  href: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-moss/30 bg-white/50 p-10 text-center">
      <h1 className="font-display text-3xl text-moss">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-ink/70">{body}</p>
      <a
        href={href}
        className="mt-6 inline-block rounded-full bg-moss px-5 py-2.5 text-sm font-semibold text-white"
      >
        {actionLabel}
      </a>
    </div>
  );
}
