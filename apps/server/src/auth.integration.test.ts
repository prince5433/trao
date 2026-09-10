import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  allocateSchedule,
  checkCoverage,
  mergeCategoryQuestions,
  type PrepKit,
} from '@prep/core';
import { createApp, connectDb } from './app.js';
import { User, Kit } from './models.js';

describe('ownership and auth', () => {
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
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }
  });

  it('registers, logs in, and isolates kits by user', async () => {
    const agentA = request.agent(app);
    const agentB = request.agent(app);

    await agentA
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: 'password123' })
      .expect(201);

    await agentB
      .post('/api/auth/register')
      .send({ email: 'b@example.com', password: 'password123' })
      .expect(201);

    const userA = await User.findOne({ email: 'a@example.com' });
    const kit = await Kit.create({
      userId: userA!._id,
      jd: 'Engineer',
      companyUrl: 'https://example.com',
      daysAvailable: 3,
      status: 'ready',
      content: minimalKit(),
      itemMeta: {},
    });

    await agentA.get(`/api/kits/${kit._id}`).expect(200);
    await agentB.get(`/api/kits/${kit._id}`).expect(404);
    await agentB.patch(`/api/kits/${kit._id}`).send({ content: minimalKit() }).expect(404);
  });

  it('rejects unauthenticated access', async () => {
    await request(app).get('/api/kits').expect(401);
  });
});

describe('regeneration preserve edits (unit via core)', () => {
  it('keeps edited technical question', () => {
    const existing = [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical' as const,
        prompt: 'old',
        answer_outline: 'a',
        difficulty: 1 as const,
      },
      {
        id: 'q2',
        requirement_ids: ['r1'],
        category: 'technical' as const,
        prompt: 'EDITED',
        answer_outline: 'b',
        difficulty: 2 as const,
      },
    ];
    const merged = mergeCategoryQuestions(
      existing,
      [
        {
          id: 'qx',
          requirement_ids: ['r1'],
          category: 'technical',
          prompt: 'new',
          answer_outline: 'n',
          difficulty: 2,
        },
      ],
      'technical',
      {
        q1: { origin: 'generated', pinned: false, updatedAt: '' },
        q2: { origin: 'edited', pinned: false, updatedAt: '' },
      },
    );
    expect(merged.questions.some((q) => q.prompt === 'EDITED')).toBe(true);
    expect(merged.questions.some((q) => q.prompt === 'old')).toBe(false);
  });
});

describe('deterministic helpers used by API', () => {
  it('coverage + schedule compose', () => {
    const requirements = [
      { id: 'r1', text: 'Go', kind: 'technical' as const, priority: 'must' as const },
    ];
    const questions = [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical' as const,
        prompt: 'Go?',
        answer_outline: '',
        difficulty: 2 as const,
      },
    ];
    expect(checkCoverage(requirements, questions).uncovered_must_ids).toEqual([]);
    const schedule = allocateSchedule(questions, requirements, 2);
    expect(schedule.days).toHaveLength(2);
  });
});

function minimalKit(): PrepKit {
  return {
    source: {
      company: 'Ex',
      company_url: 'https://example.com',
      role: 'Engineer',
      location: '',
      jd_chars: 10,
      researched_at: new Date().toISOString(),
      pages_used: [],
    },
    company_brief: { summary: 's', what_they_do: 'w', sources: [] },
    role: {
      title: 'Engineer',
      seniority: 'mid',
      responsibilities: [],
      requirements: [{ id: 'r1', text: 'JS', kind: 'technical', priority: 'must' }],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Q',
        answer_outline: 'A',
        difficulty: 2,
      },
    ],
    flashcards: [{ id: 'f1', front: 'F', back: 'B', requirement_ids: ['r1'] }],
    schedule: {
      days_available: 1,
      days: [{ day: 1, focus: 'All', question_ids: ['q1'], minutes: 60 }],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}
