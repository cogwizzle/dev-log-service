import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/jira.js', () => ({ getJiraActivity: vi.fn() }));
vi.mock('../../src/db/cache.js', () => ({
  getReport: vi.fn(() => null),
  listReports: vi.fn(() => []),
  saveReport: vi.fn(),
}));
vi.mock('../../src/cron/scheduler.js', () => ({ startScheduler: vi.fn() }));

const { getJiraActivity } = await import('../../src/services/jira.js');
const { default: app } = await import('../../src/server.js');

beforeEach(() => vi.clearAllMocks());

describe('GET /api/jira', () => {
  it('returns 400 for invalid date', async () => {
    const res = await request(app).get('/api/jira?date=nope');
    expect(res.status).toBe(400);
  });

  it('returns jira activity', async () => {
    const activity = { commentedIssues: [], createdIssues: [], updatedIssues: [] };
    getJiraActivity.mockResolvedValue(activity);
    const res = await request(app).get('/api/jira?date=2026-01-01');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activity, date: '2026-01-01' });
  });

  it('returns 500 when service throws', async () => {
    getJiraActivity.mockRejectedValue(new Error('API error'));
    const res = await request(app).get('/api/jira?date=2026-01-01');
    expect(res.status).toBe(500);
  });
});
