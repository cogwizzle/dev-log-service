import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/github.js', () => ({ getGithubActivity: vi.fn() }));
vi.mock('../../src/db/cache.js', () => ({
  getReport: vi.fn(() => null),
  listReports: vi.fn(() => []),
  saveReport: vi.fn(),
}));
vi.mock('../../src/cron/scheduler.js', () => ({ startScheduler: vi.fn() }));

const { getGithubActivity } = await import('../../src/services/github.js');
const { default: app } = await import('../../src/server.js');

beforeEach(() => vi.clearAllMocks());

describe('GET /api/github', () => {
  it('returns 400 for invalid date', async () => {
    const res = await request(app).get('/api/github?date=bad');
    expect(res.status).toBe(400);
  });

  it('returns github activity', async () => {
    const activity = { authoredPRs: [], commentedPRs: [], commits: [], reviewedPRs: [] };
    getGithubActivity.mockReturnValue(activity);
    const res = await request(app).get('/api/github?date=2026-01-01');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activity, date: '2026-01-01' });
  });

  it('returns 500 when service throws', async () => {
    getGithubActivity.mockImplementation(() => { throw new Error('gh not found'); });
    const res = await request(app).get('/api/github?date=2026-01-01');
    expect(res.status).toBe(500);
  });
});
