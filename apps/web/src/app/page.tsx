export default function HomePage() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-moss/10 bg-gradient-to-br from-mist via-sand to-white p-8 md:p-14 shadow-soft">
      <div className="absolute inset-0 opacity-40" aria-hidden>
        <div className="absolute -right-20 top-0 h-72 w-72 rounded-full bg-leaf/20 blur-3xl" />
        <div className="absolute bottom-0 left-10 h-56 w-56 rounded-full bg-ember/15 blur-3xl" />
      </div>
      <div className="relative max-w-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-leaf">
          Interview preparation
        </p>
        <h1 className="font-display text-5xl leading-tight text-moss md:text-6xl">
          Trao Prep
        </h1>
        <p className="mt-4 max-w-xl text-lg text-ink/75">
          Paste a job description, point at the company site, and get a researched kit —
          questions, flashcards, and a day-by-day schedule you can reshape.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="/register"
            className="rounded-full bg-moss px-6 py-3 text-sm font-semibold text-white transition hover:bg-leaf"
          >
            Get started
          </a>
          <a
            href="/login"
            className="rounded-full border border-moss/30 bg-white/70 px-6 py-3 text-sm font-semibold text-moss"
          >
            Log in
          </a>
        </div>
      </div>
    </section>
  );
}
