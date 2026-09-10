'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AuthShell, Field, useAuthForm } from '@/components/AuthForm';

export default function LoginPage() {
  const router = useRouter();
  const form = useAuthForm(async (email, password) => {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    router.push('/dashboard');
  });

  return (
    <AuthShell title="Welcome back" subtitle="Log in to continue your kits.">
      <form onSubmit={form.onSubmit} className="space-y-4">
        <Field label="Email" type="email" value={form.email} onChange={form.setEmail} required />
        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={form.setPassword}
          required
        />
        {form.error && <p className="text-sm text-ember">{form.error}</p>}
        <button
          type="submit"
          disabled={form.loading}
          className="w-full rounded-full bg-moss py-3 font-semibold text-white disabled:opacity-60"
        >
          {form.loading ? 'Signing in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-4 text-sm text-ink/70">
        No account?{' '}
        <a className="text-moss underline" href="/register">
          Register
        </a>
      </p>
    </AuthShell>
  );
}
