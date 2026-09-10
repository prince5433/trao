import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trao Prep — AI Interview Prep Kit',
  description: 'Turn a job description into a researched, editable interview preparation kit.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-moss/10 bg-sand/70 backdrop-blur sticky top-0 z-20">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
              <a href="/" className="font-display text-2xl tracking-tight text-moss">
                Trao Prep
              </a>
              <nav className="flex gap-4 text-sm font-semibold text-ink/80">
                <a href="/dashboard" className="hover:text-moss">
                  Kits
                </a>
                <a href="/create" className="hover:text-moss">
                  New kit
                </a>
                <a href="/login" className="hover:text-moss">
                  Account
                </a>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
