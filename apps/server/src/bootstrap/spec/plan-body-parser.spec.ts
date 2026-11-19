import { beforeAll, describe, expect, it } from '@jest/globals';
import express = require('express');
import { json } from 'express';
import request = require('supertest');
import { PLAN_MAX_BYTES, registerPlanBodyParser } from '../plan-body-parser';

const longPlan = {
  title: '32-week running plan',
  periodWeeks: 32,
  workouts: Array.from({ length: 149 }, (_, index) => ({
    weekIndex: Math.floor(index / 5) + 1,
    dayIndex: (index % 5) + 1,
    sessionIndex: 1,
    sportType: 'RUN',
    text: 'warmup 15m\nrepeat 5 {\nwork 3m hr z5\nrecovery 3m\n}\ncooldown 10m',
    notes:
      'Run the warm-up easily, repeat the work and recovery steps, then cool down. '.repeat(
        12,
      ),
    definition: {
      kind: 'ENDURANCE',
      version: 1,
      source: 'STRUCTURE',
      structure: {
        kind: 'ENDURANCE',
        version: 1,
        blocks: [
          { type: 'warmup', durationSeconds: 900 },
          { type: 'work', durationSeconds: 1800 },
          { type: 'cooldown', durationSeconds: 600 },
        ],
      },
    },
  })),
};

describe('plan body parser before the default auth parser', () => {
  const app = express();
  beforeAll(() => {
    registerPlanBodyParser(app as never);
    app.use(json({ limit: 100 * 1024 }));
    app.post('/plans', (req, res) =>
      res.json({ count: req.body.workouts.length }),
    );
    app.put('/plans/:id', (req, res) =>
      res.json({ count: req.body.workouts.length }),
    );
    app.post('/ordinary-json', (_req, res) => res.sendStatus(200));
  });

  it.each(['post', 'put'] as const)(
    'accepts a 149-session plan on %s',
    async (method) => {
      expect(Buffer.byteLength(JSON.stringify(longPlan))).toBeGreaterThan(
        100 * 1024,
      );
      const response = await request(app)
        [method](method === 'post' ? '/plans' : '/plans/plan-1')
        .send(longPlan)
        .expect(200);
      expect(response.body.count).toBe(149);
    },
  );

  it('retains the default limit on unrelated routes', async () => {
    await request(app).post('/ordinary-json').send(longPlan).expect(413);
  });

  it('rejects a plan above the dedicated bounded limit', async () => {
    await request(app)
      .post('/plans')
      .send({ title: 'x'.repeat(PLAN_MAX_BYTES) })
      .expect(413);
  });
});
