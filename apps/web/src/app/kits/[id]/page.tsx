'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { PrepKit, QuestionCategory } from '@prep/core/browser';
import { PROGRESS_STEPS } from '@prep/core/browser';
import { API_URL, api, type KitRecord } from '@/lib/api';

const STEP_LABELS: Record<string, string> = {
  validating_jd: 'Validating job description',
  checking_company_site: 'Checking company site',
  discovering_pages: 'Discovering pages',
  researching_company: 'Researching company',
  searching_interview_info: 'Searching interview information',
  extracting_requirements: 'Extracting requirements',
  generating_technical: 'Generating technical questions',
  generating_behavioural: 'Generating behavioural questions',
  generating_system_design: 'Generating system-design questions',
  generating_company_fit: 'Generating company-fit questions',
  generating_flashcards: 'Generating flashcards',
  checking_coverage: 'Checking requirement coverage',
  filling_gaps: 'Filling coverage gaps',
  allocating_schedule: 'Allocating schedule',
  validating_kit: 'Validating kit',
  saving_kit: 'Saving kit',
};

type Tab = 'brief' | 'role' | 'questions' | 'flashcards' | 'schedule' | 'coverage' | 'practice' | 'weak';

export default function KitPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [kit, setKit] = useState<KitRecord | null>(null);
  const [local, setLocal] = useState<PrepKit | null>(null);
  const [tab, setTab] = useState<Tab>('brief');
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('');
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set());
  const [regenBusy, setRegenBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await api<{ kit: KitRecord }>(`/api/kits/${id}`);
    setKit(data.kit);
    if (data.kit.content) setLocal(structuredClone(data.kit.content));
  }, [id]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  useEffect(() => {
    if (!kit || (kit.status !== 'generating' && kit.status !== 'pending')) return;
    const es = new EventSource(`${API_URL}/api/kits/${id}/events`, { withCredentials: true } as never);
    // EventSource doesn't support credentials in all browsers the same way; fall back to polling.
    es.close();

    const timer = setInterval(() => {
      load().catch(() => undefined);
    }, 1500);
    return () => clearInterval(timer);
  }, [kit?.status, id, load]);

  // Debounced save
  useEffect(() => {
    if (!local || !kit || kit.status === 'generating' || kit.status === 'pending') return;
    const handle = setTimeout(async () => {
      try {
        setSaveState('Saving…');
        const data = await api<{ kit: KitRecord }>(`/api/kits/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            content: local,
            editedIds: [...editedIds],
          }),
        });
        setKit(data.kit);
        setEditedIds(new Set());
        setSaveState('Saved');
      } catch (err) {
        setSaveState(err instanceof Error ? err.message : 'Save failed');
      }
    }, 700);
    return () => clearTimeout(handle);
  }, [local, editedIds, id, kit?.status]);

  const generating = kit?.status === 'generating' || kit?.status === 'pending';

  async function regenerate(section: 'company_brief' | 'questions' | 'schedule', category?: QuestionCategory) {
    setRegenBusy(true);
    setError('');
    try {
      const data = await api<{ kit: KitRecord }>(`/api/kits/${id}/regenerate`, {
        method: 'POST',
        body: JSON.stringify({ section, category }),
      });
      setKit(data.kit);
      if (data.kit.content) setLocal(structuredClone(data.kit.content));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setRegenBusy(false);
    }
  }

  function markEdited(itemId: string) {
    setEditedIds((prev) => new Set(prev).add(itemId));
  }

  if (error && !kit) {
    return <p className="text-ember">{error}</p>;
  }
  if (!kit) return <p className="text-ink/60">Loading kit…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-leaf">Prep kit</p>
          <h1 className="font-display text-4xl text-moss">
            {local?.source.company || kit.company_url}
          </h1>
          <p className="text-ink/70">
            {local?.role.title || 'Generating role…'} · {kit.days} days ·{' '}
            <span className="font-semibold">{kit.status}</span>
          </p>
        </div>
        <div className="text-right text-sm text-ink/60">
          <div>{saveState}</div>
          <a href="/dashboard" className="text-moss underline">
            All kits
          </a>
        </div>
      </div>

      {kit.warnings?.length > 0 && (
        <div className="rounded-2xl border border-ember/30 bg-ember/5 p-4 text-sm">
          <p className="font-semibold text-ember">Research notes</p>
          <ul className="mt-1 list-disc pl-5 text-ink/80">
            {kit.warnings.map((w, i) => (
              <li key={i}>
                {w.code}: {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {kit.status === 'failed' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
          Generation failed: {kit.error?.code} — {kit.error?.message}
        </div>
      )}

      {generating && <ProgressPanel kit={kit} />}

      {!generating && local && (
        <>
          <div className="flex flex-wrap gap-2">
            {(
              [
                'brief',
                'role',
                'questions',
                'flashcards',
                'schedule',
                'coverage',
                'practice',
                'weak',
              ] as Tab[]
            ).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold capitalize ${
                  tab === t ? 'bg-moss text-white' : 'border border-moss/20 bg-white'
                }`}
              >
                {t === 'weak' ? 'Weak spots' : t}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-ember">{error}</p>}

          {tab === 'brief' && (
            <BriefEditor
              kit={local}
              busy={regenBusy}
              onChange={(next) => {
                setLocal(next);
                markEdited('company_brief');
              }}
              onRegen={() => regenerate('company_brief')}
            />
          )}
          {tab === 'role' && (
            <RoleEditor
              kit={local}
              onChange={(next) => {
                setLocal(next);
              }}
            />
          )}
          {tab === 'questions' && (
            <QuestionsEditor
              kit={local}
              busy={regenBusy}
              onChange={(next, idEdited) => {
                setLocal(next);
                if (idEdited) markEdited(idEdited);
              }}
              onRegen={(category) => regenerate('questions', category)}
            />
          )}
          {tab === 'flashcards' && (
            <FlashcardsEditor
              kit={local}
              onChange={(next, idEdited) => {
                setLocal(next);
                if (idEdited) markEdited(idEdited);
              }}
            />
          )}
          {tab === 'schedule' && (
            <ScheduleView
              kit={local}
              busy={regenBusy}
              onRegen={() => regenerate('schedule')}
            />
          )}
          {tab === 'coverage' && <CoverageView kit={local} />}
          {tab === 'practice' && <PracticePanel kitId={id} />}
          {tab === 'weak' && <WeakSpotsPanel kitId={id} />}
        </>
      )}
    </div>
  );
}

function ProgressPanel({ kit }: { kit: KitRecord }) {
  const completed = new Set(kit.progress?.completedSteps ?? []);
  return (
    <div className="rounded-3xl border border-moss/10 bg-white/80 p-6 shadow-soft">
      <h2 className="font-display text-2xl text-moss">Generating…</h2>
      <p className="text-sm text-ink/70">{kit.progress?.message || 'Working through the pipeline'}</p>
      <ol className="mt-4 space-y-2">
        {PROGRESS_STEPS.map((step) => {
          const done = completed.has(step);
          const current = kit.progress?.step === step;
          return (
            <li
              key={step}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${
                current ? 'bg-mist font-semibold text-moss' : done ? 'text-ink/70' : 'text-ink/40'
              }`}
            >
              <span className="w-5">{done ? '✓' : current ? '●' : '○'}</span>
              {STEP_LABELS[step] || step}
            </li>
          );
        })}
      </ol>
      {kit.progress?.errors?.length > 0 && (
        <div className="mt-4 text-sm text-ember">
          {kit.progress.errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function BriefEditor({
  kit,
  onChange,
  onRegen,
  busy,
}: {
  kit: PrepKit;
  onChange: (k: PrepKit) => void;
  onRegen: () => void;
  busy: boolean;
}) {
  return (
    <section className="space-y-4 rounded-3xl border border-moss/10 bg-white/80 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-moss">Company brief</h2>
        <button
          type="button"
          disabled={busy}
          onClick={onRegen}
          className="rounded-full border border-moss/20 px-3 py-1.5 text-sm font-semibold"
        >
          Regenerate brief
        </button>
      </div>
      <label className="block text-sm font-semibold">
        Summary
        <textarea
          className="mt-1 w-full rounded-xl border border-moss/20 bg-sand/40 px-3 py-2 font-normal"
          rows={4}
          value={kit.company_brief.summary}
          onChange={(e) =>
            onChange({
              ...kit,
              company_brief: { ...kit.company_brief, summary: e.target.value },
            })
          }
        />
      </label>
      <label className="block text-sm font-semibold">
        What they do
        <textarea
          className="mt-1 w-full rounded-xl border border-moss/20 bg-sand/40 px-3 py-2 font-normal"
          rows={4}
          value={kit.company_brief.what_they_do}
          onChange={(e) =>
            onChange({
              ...kit,
              company_brief: { ...kit.company_brief, what_they_do: e.target.value },
            })
          }
        />
      </label>
      <p className="text-xs text-ink/50">Sources: {kit.company_brief.sources.join(', ') || 'none'}</p>
    </section>
  );
}

function RoleEditor({ kit, onChange }: { kit: PrepKit; onChange: (k: PrepKit) => void }) {
  return (
    <section className="space-y-4 rounded-3xl border border-moss/10 bg-white/80 p-6">
      <h2 className="font-display text-2xl text-moss">Role</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-semibold">
          Title
          <input
            className="mt-1 w-full rounded-xl border border-moss/20 bg-sand/40 px-3 py-2 font-normal"
            value={kit.role.title}
            onChange={(e) => onChange({ ...kit, role: { ...kit.role, title: e.target.value } })}
          />
        </label>
        <label className="text-sm font-semibold">
          Seniority
          <input
            className="mt-1 w-full rounded-xl border border-moss/20 bg-sand/40 px-3 py-2 font-normal"
            value={kit.role.seniority}
            onChange={(e) =>
              onChange({ ...kit, role: { ...kit.role, seniority: e.target.value } })
            }
          />
        </label>
      </div>
      <div>
        <h3 className="font-semibold">Requirements</h3>
        <ul className="mt-2 space-y-2">
          {kit.role.requirements.map((r) => (
            <li key={r.id} className="rounded-xl border border-moss/10 bg-sand/30 p-3 text-sm">
              <div className="flex gap-2 text-xs font-semibold uppercase tracking-wide text-leaf">
                <span>{r.id}</span>
                <span>{r.kind}</span>
                <span>{r.priority}</span>
              </div>
              <input
                className="mt-1 w-full bg-transparent font-normal"
                value={r.text}
                onChange={(e) => {
                  const requirements = kit.role.requirements.map((x) =>
                    x.id === r.id ? { ...x, text: e.target.value } : x,
                  );
                  onChange({ ...kit, role: { ...kit.role, requirements } });
                }}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function QuestionsEditor({
  kit,
  onChange,
  onRegen,
  busy,
}: {
  kit: PrepKit;
  onChange: (k: PrepKit, editedId?: string) => void;
  onRegen: (c: QuestionCategory) => void;
  busy: boolean;
}) {
  const categories: QuestionCategory[] = [
    'technical',
    'behavioural',
    'system-design',
    'company-fit',
  ];

  function move(id: string, dir: -1 | 1) {
    const idx = kit.questions.findIndex((q) => q.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= kit.questions.length) return;
    const questions = [...kit.questions];
    const tmp = questions[idx];
    questions[idx] = questions[j];
    questions[j] = tmp;
    onChange({ ...kit, questions });
  }

  function addQuestion(category: QuestionCategory) {
    const n =
      Math.max(0, ...kit.questions.map((q) => Number(q.id.replace(/\D/g, '') || 0))) + 1;
    const id = `q${n}`;
    const req = kit.role.requirements[0]?.id;
    onChange(
      {
        ...kit,
        questions: [
          ...kit.questions,
          {
            id,
            requirement_ids: req ? [req] : [],
            category,
            prompt: 'New question',
            answer_outline: 'Outline your answer',
            difficulty: 2,
          },
        ],
      },
      id,
    );
  }

  return (
    <section className="space-y-6">
      {categories.map((category) => {
        const items = kit.questions.filter((q) => q.category === category);
        return (
          <div key={category} className="rounded-3xl border border-moss/10 bg-white/80 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl capitalize text-moss">{category}</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-full border border-moss/20 px-3 py-1 text-xs font-semibold"
                  onClick={() => addQuestion(category)}
                >
                  Add
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-full border border-moss/20 px-3 py-1 text-xs font-semibold"
                  onClick={() => onRegen(category)}
                >
                  Regenerate
                </button>
              </div>
            </div>
            <ul className="space-y-3">
              {items.map((q) => (
                <li key={q.id} className="rounded-xl border border-moss/10 bg-sand/30 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold">{q.id}</span>
                    <span>reqs: {q.requirement_ids.join(', ')}</span>
                    <label>
                      difficulty
                      <select
                        className="ml-1 rounded border border-moss/20 bg-white px-1"
                        value={q.difficulty}
                        onChange={(e) => {
                          const questions = kit.questions.map((x) =>
                            x.id === q.id
                              ? { ...x, difficulty: Number(e.target.value) as 1 | 2 | 3 }
                              : x,
                          );
                          onChange({ ...kit, questions }, q.id);
                        }}
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                      </select>
                    </label>
                    <label>
                      category
                      <select
                        className="ml-1 rounded border border-moss/20 bg-white px-1"
                        value={q.category}
                        onChange={(e) => {
                          const questions = kit.questions.map((x) =>
                            x.id === q.id
                              ? { ...x, category: e.target.value as QuestionCategory }
                              : x,
                          );
                          onChange({ ...kit, questions }, q.id);
                        }}
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="underline" onClick={() => move(q.id, -1)}>
                      Up
                    </button>
                    <button type="button" className="underline" onClick={() => move(q.id, 1)}>
                      Down
                    </button>
                    <button
                      type="button"
                      className="text-ember underline"
                      onClick={() =>
                        onChange({
                          ...kit,
                          questions: kit.questions.filter((x) => x.id !== q.id),
                          schedule: {
                            ...kit.schedule,
                            days: kit.schedule.days.map((d) => ({
                              ...d,
                              question_ids: d.question_ids.filter((id) => id !== q.id),
                            })),
                          },
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                  <textarea
                    className="w-full rounded-lg border border-moss/10 bg-white px-2 py-1 text-sm"
                    rows={2}
                    value={q.prompt}
                    onChange={(e) => {
                      const questions = kit.questions.map((x) =>
                        x.id === q.id ? { ...x, prompt: e.target.value } : x,
                      );
                      onChange({ ...kit, questions }, q.id);
                    }}
                  />
                  <textarea
                    className="mt-2 w-full rounded-lg border border-moss/10 bg-white px-2 py-1 text-sm"
                    rows={2}
                    value={q.answer_outline}
                    onChange={(e) => {
                      const questions = kit.questions.map((x) =>
                        x.id === q.id ? { ...x, answer_outline: e.target.value } : x,
                      );
                      onChange({ ...kit, questions }, q.id);
                    }}
                  />
                </li>
              ))}
              {items.length === 0 && (
                <li className="text-sm text-ink/50">No questions in this category.</li>
              )}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function FlashcardsEditor({
  kit,
  onChange,
}: {
  kit: PrepKit;
  onChange: (k: PrepKit, editedId?: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-moss/10 bg-white/80 p-6">
      <div className="mb-3 flex justify-between">
        <h2 className="font-display text-2xl text-moss">Flashcards</h2>
        <button
          type="button"
          className="rounded-full border border-moss/20 px-3 py-1 text-sm font-semibold"
          onClick={() => {
            const n =
              Math.max(0, ...kit.flashcards.map((f) => Number(f.id.replace(/\D/g, '') || 0))) +
              1;
            const id = `f${n}`;
            onChange(
              {
                ...kit,
                flashcards: [
                  ...kit.flashcards,
                  {
                    id,
                    front: 'New card',
                    back: 'Answer',
                    requirement_ids: kit.role.requirements[0] ? [kit.role.requirements[0].id] : [],
                  },
                ],
              },
              id,
            );
          }}
        >
          Add card
        </button>
      </div>
      <ul className="space-y-3">
        {kit.flashcards.map((f) => (
          <li key={f.id} className="rounded-xl border border-moss/10 bg-sand/30 p-3">
            <div className="mb-1 flex justify-between text-xs font-semibold">
              <span>{f.id}</span>
              <button
                type="button"
                className="text-ember"
                onClick={() =>
                  onChange({
                    ...kit,
                    flashcards: kit.flashcards.filter((x) => x.id !== f.id),
                  })
                }
              >
                Delete
              </button>
            </div>
            <input
              className="mb-2 w-full rounded border border-moss/10 px-2 py-1 text-sm"
              value={f.front}
              onChange={(e) => {
                const flashcards = kit.flashcards.map((x) =>
                  x.id === f.id ? { ...x, front: e.target.value } : x,
                );
                onChange({ ...kit, flashcards }, f.id);
              }}
            />
            <textarea
              className="w-full rounded border border-moss/10 px-2 py-1 text-sm"
              rows={2}
              value={f.back}
              onChange={(e) => {
                const flashcards = kit.flashcards.map((x) =>
                  x.id === f.id ? { ...x, back: e.target.value } : x,
                );
                onChange({ ...kit, flashcards }, f.id);
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScheduleView({
  kit,
  onRegen,
  busy,
}: {
  kit: PrepKit;
  onRegen: () => void;
  busy: boolean;
}) {
  return (
    <section className="rounded-3xl border border-moss/10 bg-white/80 p-6">
      <div className="mb-3 flex justify-between">
        <h2 className="font-display text-2xl text-moss">
          Schedule ({kit.schedule.days_available} days)
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={onRegen}
          className="rounded-full border border-moss/20 px-3 py-1.5 text-sm font-semibold"
        >
          Regenerate schedule
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {kit.schedule.days.map((d) => (
          <div key={d.day} className="rounded-xl border border-moss/10 bg-sand/40 p-4">
            <h3 className="font-semibold text-moss">Day {d.day}</h3>
            <p className="text-sm text-ink/70">{d.focus}</p>
            <p className="mt-2 text-xs">{d.minutes} minutes</p>
            <p className="mt-1 text-xs text-ink/60">{d.question_ids.join(', ') || 'No questions'}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CoverageView({ kit }: { kit: PrepKit }) {
  return (
    <section className="rounded-3xl border border-moss/10 bg-white/80 p-6">
      <h2 className="font-display text-2xl text-moss">Coverage</h2>
      <p className="text-sm text-ink/70">Passes run: {kit.coverage.passes}</p>
      <p className="mt-2 text-sm">
        Uncovered must-have IDs:{' '}
        {kit.coverage.uncovered_requirement_ids.length
          ? kit.coverage.uncovered_requirement_ids.join(', ')
          : 'None — all must-haves covered'}
      </p>
    </section>
  );
}

function PracticePanel({ kitId }: { kitId: string }) {
  const [cards, setCards] = useState<
    Array<{ id: string; front: string; back: string }>
  >([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [practice, setPractice] = useState<Record<string, { confidence: number | null; covered: boolean }>>({});

  useEffect(() => {
    api<{
      flashcards: Array<{ id: string; front: string; back: string }>;
      orderedIds: string[];
      practice: { cards: Record<string, { confidence: number | null; covered: boolean }> };
    }>(`/api/kits/${kitId}/practice`).then((data) => {
      const byId = new Map(data.flashcards.map((f) => [f.id, f]));
      setCards(data.orderedIds.map((id) => byId.get(id)!).filter(Boolean));
      setPractice(data.practice.cards || {});
    });
  }, [kitId]);

  const current = cards[index];
  const coveredCount = useMemo(
    () => Object.values(practice).filter((c) => c.covered).length,
    [practice],
  );

  async function rate(confidence: 1 | 2 | 3) {
    if (!current) return;
    await api(`/api/kits/${kitId}/practice`, {
      method: 'POST',
      body: JSON.stringify({ flashcardId: current.id, confidence }),
    });
    setPractice((p) => ({
      ...p,
      [current.id]: { confidence, covered: true },
    }));
    setRevealed(false);
    if (index + 1 >= cards.length) setDone(true);
    else setIndex((i) => i + 1);
  }

  if (!cards.length) return <p className="text-ink/60">No flashcards yet.</p>;
  if (done) {
    return (
      <div className="rounded-3xl border border-moss/10 bg-white/80 p-8 text-center">
        <h2 className="font-display text-3xl text-moss">Practice complete</h2>
        <p className="mt-2 text-ink/70">
          Covered {coveredCount} / {cards.length} cards. Next session prioritizes lower confidence.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-3xl border border-moss/10 bg-white/80 p-6">
      <div className="mb-4 flex justify-between text-sm text-ink/60">
        <span>
          Card {index + 1} / {cards.length}
        </span>
        <span>
          Covered {coveredCount} / {cards.length}
        </span>
      </div>
      <div className="min-h-[160px] rounded-2xl bg-mist/60 p-6">
        <p className="font-display text-2xl text-moss">{current.front}</p>
        {revealed && <p className="mt-4 text-ink/80">{current.back}</p>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {!revealed ? (
          <button
            type="button"
            className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white"
            onClick={() => setRevealed(true)}
          >
            Reveal answer
          </button>
        ) : (
          <>
            <button type="button" className="rounded-full border px-3 py-2 text-sm" onClick={() => rate(1)}>
              Low (1)
            </button>
            <button type="button" className="rounded-full border px-3 py-2 text-sm" onClick={() => rate(2)}>
              Medium (2)
            </button>
            <button type="button" className="rounded-full border px-3 py-2 text-sm" onClick={() => rate(3)}>
              High (3)
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function WeakSpotsPanel({ kitId }: { kitId: string }) {
  const [report, setReport] = useState<{
    weakest_requirements: Array<{ id: string; text: string; avgConfidence: number | null }>;
    weakest_categories: Array<{ category: string; avgConfidence: number | null }>;
    low_confidence_flashcards: Array<{ id: string; front: string; confidence: number | null }>;
    recommended_focus: string[];
  } | null>(null);

  useEffect(() => {
    api<{ report: typeof report }>(`/api/kits/${kitId}/weak-spots`).then((d) => setReport(d.report));
  }, [kitId]);

  if (!report) return <p className="text-ink/60">Loading weak spots…</p>;

  return (
    <section className="space-y-4 rounded-3xl border border-moss/10 bg-white/80 p-6">
      <h2 className="font-display text-2xl text-moss">Interview weak spots</h2>
      <p className="text-sm text-ink/70">
        Built from your practice confidence so you know where to spend the next study block.
      </p>
      <div>
        <h3 className="font-semibold">Recommended focus</h3>
        <ul className="mt-1 list-disc pl-5 text-sm">
          {report.recommended_focus.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-semibold">Low-confidence cards</h3>
        <ul className="mt-1 space-y-1 text-sm">
          {report.low_confidence_flashcards.length === 0 && (
            <li className="text-ink/50">Practice a few cards to populate this list.</li>
          )}
          {report.low_confidence_flashcards.map((c) => (
            <li key={c.id}>
              {c.front} (confidence {c.confidence})
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
