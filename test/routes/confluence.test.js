import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/confluence.js', () => ({ getConfluenceActivity: vi.fn() }));
vi.mock('../../src/db/cache.js', () => ({
  getReport: vi.fn(() => null),
  listReports: vi.fn(() => []),
  saveReport: vi.fn(),
}));
vi.mock('../../src/cron/scheduler.js', () => ({ startScheduler: vi.fn() }));

const { getConfluenceActivity } = await import('../../src/services/confluence.js');
const { default: app } = await import('../../src/server.js');

beforeEach(() => vi.clearAllMocks());

describe('GET /api/confluence', () => {
  it('returns 400 for invalid date', async () => {
    const res = await request(app).get('/api/confluence?date=nope');
    expect(res.status).toBe(400);
  });

  it('returns confluence activity', async () => {
    const activity = { comments: [], createdPages: [], updatedPages: [] };
    getConfluenceActivity.mockResolvedValue(activity);
    const res = await request(app).get('/api/confluence?date=2026-01-01');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activity, date: '2026-01-01' });
  });

  it('returns 500 when service throws', async () => {
    getConfluenceActivity.mockRejectedValue(new Error('API error'));
    const res = await request(app).get('/api/confluence?date=2026-01-01');
    expect(res.status).toBe(500);
  });
});
