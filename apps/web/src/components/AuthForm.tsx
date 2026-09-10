'use client';

import { FormEvent, useState } from 'react';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-moss/10 bg-white/80 p-8 shadow-soft">
      <h1 className="font-display text-3xl text-moss">{title}</h1>
      <p className="mt-1 text-ink/70">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function Field({
  label,
  type,
  value,
  onChange,
  required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-moss/20 bg-sand/50 px-3 py-2 font-normal"
      />
    </label>
  );
}

export function useAuthForm(submit: (email: string, password: string) => Promise<void>) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await submit(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return { email, setEmail, password, setPassword, error, loading, onSubmit };
}
