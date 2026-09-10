import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  fingerprintInput,
  markEdited,
  orderFlashcardsForPractice,
  type PrepKit,
} from '@prep/core';
import { createApp, connectDb } from './app.js';
import { Kit, User } from './models.js';

function minimalKit(overrides?: Partial<PrepKit>): PrepKit {
  const base: PrepKit = {
    source: {
      company: 'Acme',
      company_url: 'https://example.com',
      role: 'Senior Backend Engineer',
      location: 'Remote',
      jd_chars: 200,
      researched_at: new Date().toISOString(),
      pages_used: ['https://example.com/'],
    },
    company_brief: {
      summary: 'ORIGINAL BRIEF SUMMARY',
      what_they_do: 'Builds APIs',
      sources: ['https://example.com/'],
    },
    role: {
      title: 'Senior Backend Engineer',
      seniority: 'senior',
      responsibilities: ['Own APIs'],
      requirements: [
        { id: 'r1', text: 'Node.js', kind: 'technical', priority: 'must' },
        { id: 'r2', text: 'Mentoring', kind: 'behavioural', priority: 'must' },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'ORIGINAL TECH PROMPT',
        answer_outline: 'A',
        difficulty: 2,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'behavioural',
        prompt: 'ORIGINAL BEHAVIOURAL PROMPT',
        answer_outline: 'B',
        difficulty: 2,
      },
      {
        id: 'q3',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Second tech',
        answer_outline: 'C',
        difficulty: 3,
      },
    ],
    flashcards: [
      { id: 'f1', front: 'Node', back: 'Runtime', requirement_ids: ['r1'] },
      { id: 'f2', front: 'Mentor', back: 'Feedback', requirement_ids: ['r2'] },
    ],
    schedule: {
      days_available: 3,
      days: [
        { day: 1, focus: 'Tech', question_ids: ['q1', 'q3'], minutes: 45 },
        { day: 2, focus: 'Behaviour', question_ids: ['q2'], minutes: 30 },
        { day: 3, focus: 'Review', question_ids: ['q1'], minutes: 30 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
  return { ...base, ...overrides, role: { ...base.role, ...(overrides?.role ?? {}) } };
}

describe('RC API flows (real app + memory Mongo)', () => {
  let mongo: MongoMemoryServer;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri();
    await connectDb(mongo.getUri());
    app = createApp({ mongoUri: mongo.getUri(), useMemorySession: true });
  }, 120000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    for (const key of Object.keys(mongoose.connection.collections)) {
      await mongoose.connection.collections[key].deleteMany({});
    }
  });

  it('persists manual edits and duplicate fingerprint is per-user', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'rc@example.com', password: 'password123' })
      .expect(201);

    const user = await User.findOne({ email: 'rc@example.com' });
    const content = minimalKit();
    const jd = 'Senior Backend Engineer Required: Node.js';
    const companyUrl = 'https://example.com';
    const kit = await Kit.create({
      userId: user!._id,
      jd,
      companyUrl,
      daysAvailable: 3,
      inputFingerprint: fingerprintInput(jd, companyUrl),
      status: 'ready',
      content,
      itemMeta: {
        q1: { origin: 'generated', pinned: false, updatedAt: '' },
        q2: { origin: 'generated', pinned: false, updatedAt: '' },
      },
    });

    const edited = {
      ...content,
      questions: content.questions.map((q) =>
        q.id === 'q1' ? { ...q, prompt: 'USER EDITED TECH' } : q,
      ),
    };
    await agent
      .patch(`/api/kits/${kit._id}`)
      .send({ content: edited, editedIds: ['q1'] })
      .expect(200);

    const dup = await agent.post('/api/kits').send({ jd, company_url: companyUrl, days: 3 }).expect(200);
    expect(dup.body.reused).toBe(true);
    expect(dup.body.kit.id).toBe(kit._id.toString());

    const other = request.agent(app);
    await other
      .post('/api/auth/register')
      .send({ email: 'other@example.com', password: 'password123' })
      .expect(201);
    const otherCreate = await other
      .post('/api/kits')
      .send({
        jd: 'Senior Backend Engineer Required: Node.js',
        company_url: 'https://example.com',
        days: 3,
      })
      .expect(202);
    expect(otherCreate.body.reused).toBe(false);
    expect(otherCreate.body.kit.id).not.toBe(kit._id.toString());

    const fetched = await agent.get(`/api/kits/${kit._id}`).expect(200);
    expect(fetched.body.kit.content.questions.find((q: { id: string }) => q.id === 'q1')?.prompt).toBe(
      'USER EDITED TECH',
    );
  });

  it('practice confidence persists and prioritizes low-confidence cards', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'practice@example.com', password: 'password123' })
      .expect(201);

    const user = await User.findOne({ email: 'practice@example.com' });
    const kit = await Kit.create({
      userId: user!._id,
      jd: 'Engineer',
      companyUrl: 'https://example.com',
      daysAvailable: 3,
      status: 'ready',
      content: minimalKit(),
      practice: { cards: {} },
    });

    await agent
      .post(`/api/kits/${kit._id}/practice`)
      .send({ flashcardId: 'f1', confidence: 3 })
      .expect(200);

    const practiceRes = await agent.get(`/api/kits/${kit._id}/practice`).expect(200);
    expect(practiceRes.body.orderedIds[0]).toBe('f2');

    const weak = await agent.get(`/api/kits/${kit._id}/weak-spots`).expect(200);
    expect(weak.body.report.weakest_requirements.length).toBeGreaterThan(0);

    const relogin = request.agent(app);
    await relogin
      .post('/api/auth/login')
      .send({ email: 'practice@example.com', password: 'password123' })
      .expect(200);
    const afterLogin = await relogin.get(`/api/kits/${kit._id}/practice`).expect(200);
    expect(afterLogin.body.practice.cards.f1.confidence).toBe(3);
    expect(afterLogin.body.practice.cards.f1.covered).toBe(true);

    const ordered = orderFlashcardsForPractice(
      minimalKit().flashcards,
      afterLogin.body.practice as { cards: Record<string, { confidence: number; covered: boolean }> },
    );
    expect(ordered[0].id).toBe('f2');
  });

  it('returns 404 for malformed kit ids', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'badid@example.com', password: 'password123' })
      .expect(201);
    await agent.get('/api/kits/not-a-valid-object-id').expect(404);
  });

  it('reorder survives patch and itemMeta marks edits', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'order@example.com', password: 'password123' })
      .expect(201);
    const user = await User.findOne({ email: 'order@example.com' });
    const content = minimalKit();
    const reordered = {
      ...content,
      questions: [content.questions[2], content.questions[0], content.questions[1]],
    };
    const kit = await Kit.create({
      userId: user!._id,
      jd: 'Engineer',
      companyUrl: 'https://example.com',
      daysAvailable: 3,
      status: 'ready',
      content,
      itemMeta: markEdited({}, 'q3'),
    });

    await agent.patch(`/api/kits/${kit._id}`).send({ content: reordered }).expect(200);
    const fetched = await agent.get(`/api/kits/${kit._id}`).expect(200);
    expect(fetched.body.kit.content.questions[0].id).toBe('q3');
  });
});
