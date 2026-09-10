'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type KitRecord } from '@/lib/api';

export default function CreateKitPage() {
  const router = useRouter();
  const [jd, setJd] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [days, setDays] = useState(5);
  const [batchText, setBatchText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'single' | 'batch'>('single');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'single') {
        const data = await api<{ kit: KitRecord }>('/api/kits', {
          method: 'POST',
          body: JSON.stringify({ jd, company_url: companyUrl, days }),
        });
        router.push(`/kits/${data.kit.id}`);
      } else {
        let cases: Array<{ jd: string; company_url: string; days?: number }>;
        try {
          cases = JSON.parse(batchText);
          if (!Array.isArray(cases)) throw new Error('Batch must be a JSON array');
        } catch {
          throw new Error('Batch file content must be a JSON array of { jd, company_url, days }');
        }
        const data = await api<{ kits: KitRecord[] }>('/api/kits/batch', {
          method: 'POST',
          body: JSON.stringify({ cases }),
        });
        router.push(`/kits/${data.kits[0].id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create kit');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-4xl text-moss">Create a prep kit</h1>
      <p className="mt-2 text-ink/70">
        Paste the job description and company website. Generation crawls the site, extracts
        requirements, and builds questions through a sequenced pipeline.
      </p>

      <div className="mt-6 flex gap-2">
        <Toggle active={mode === 'single'} onClick={() => setMode('single')}>
          Single role
        </Toggle>
        <Toggle active={mode === 'batch'} onClick={() => setMode('batch')}>
          Batch upload
        </Toggle>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-3xl border border-moss/10 bg-white/80 p-6 shadow-soft">
        {mode === 'single' ? (
          <>
            <label className="block text-sm font-semibold">
              Job description
              <textarea
                required
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                rows={12}
                className="mt-1 w-full rounded-xl border border-moss/20 bg-sand/40 px-3 py-2 font-normal"
                placeholder="Paste the full job description…"
              />
            </label>
            <label className="block text-sm font-semibold">
              Company website URL
              <input
                required
                type="url"
                value={companyUrl}
                onChange={(e) => setCompanyUrl(e.target.value)}
                className="mt-1 w-full rounded-xl border border-moss/20 bg-sand/40 px-3 py-2 font-normal"
                placeholder="https://company.example"
              />
            </label>
            <label className="block text-sm font-semibold">
              Days until interview
              <input
                required
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="mt-1 w-40 rounded-xl border border-moss/20 bg-sand/40 px-3 py-2 font-normal"
              />
            </label>
          </>
        ) : (
          <label className="block text-sm font-semibold">
            Batch JSON (array of description/company pairs)
            <textarea
              required
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              rows={14}
              className="mt-1 w-full rounded-xl border border-moss/20 bg-sand/40 px-3 py-2 font-mono text-sm font-normal"
              placeholder='[{"jd":"...","company_url":"https://...","days":5}]'
            />
          </label>
        )}

        {error && <p className="text-sm text-ember">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-moss px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Starting…' : 'Generate kit'}
        </button>
      </form>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold ${
        active ? 'bg-moss text-white' : 'border border-moss/20 bg-white text-moss'
      }`}
    >
      {children}
    </button>
  );
}
