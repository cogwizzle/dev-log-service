import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/pagerduty.js', () => ({
  getPagerDutyActivity: vi.fn(),
  getRawOnCalls: vi.fn(),
}));
vi.mock('../../src/db/cache.js', () => ({
  getReport: vi.fn(),
  listReports: vi.fn(() => []),
  listSummaries: vi.fn(() => []),
  saveReport: vi.fn(),
}));
vi.mock('../../src/services/report.js', () => ({
  backfillReports: vi.fn(),
  generateReport: vi.fn(),
  previousBusinessDay: vi.fn(() => '2026-01-01'),
}));
vi.mock('../../src/cron/scheduler.js', () => ({ startScheduler: vi.fn() }));

const { getPagerDutyActivity, getRawOnCalls } = await import('../../src/services/pagerduty.js');
const { default: app } = await import('../../src/server.js');

beforeEach(() => {
  vi.clearAllMocks();
});

const emptyActivity = {
  acknowledgedIncidents: [],
  resolvedIncidents: [],
  triggeredIncidents: [],
};

describe('GET /api/pagerduty', () => {
  it('returns 400 for invalid date format', async () => {
    const res = await request(app).get('/api/pagerduty?date=not-a-date');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('date must be in YYYY-MM-DD format');
  });

  it('returns activity for a valid date', async () => {
    getPagerDutyActivity.mockResolvedValue(emptyActivity);
    const res = await request(app).get('/api/pagerduty?date=2026-01-02');
    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-01-02');
    expect(res.body.activity).toEqual(emptyActivity);
  });

  it('defaults to yesterday when no date is provided', async () => {
    getPagerDutyActivity.mockResolvedValue(emptyActivity);
    const res = await request(app).get('/api/pagerduty');
    expect(res.status).toBe(200);
    expect(getPagerDutyActivity).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('returns 500 when the service throws', async () => {
    getPagerDutyActivity.mockRejectedValue(new Error('PagerDuty API error 401: Unauthorized'));
    const res = await request(app).get('/api/pagerduty?date=2026-01-02');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('PagerDuty API error 401');
  });
});

describe('GET /api/pagerduty/debug', () => {
  it('returns 400 for invalid date format', async () => {
    const res = await request(app).get('/api/pagerduty/debug?date=bad');
    expect(res.status).toBe(400);
  });

  it('returns raw on-call entries for a valid date', async () => {
    const oncalls = [
      { escalation_level: 1, end: '2026-01-03T00:00:00Z', start: '2026-01-02T00:00:00Z' },
    ];
    getRawOnCalls.mockResolvedValue(oncalls);
    const res = await request(app).get('/api/pagerduty/debug?date=2026-01-02');
    expect(res.status).toBe(200);
    expect(res.body.oncalls).toEqual(oncalls);
    expect(res.body.date).toBe('2026-01-02');
  });

  it('returns 500 when the service throws', async () => {
    getRawOnCalls.mockRejectedValue(new Error('PagerDuty API error 403: Forbidden'));
    const res = await request(app).get('/api/pagerduty/debug?date=2026-01-02');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('403');
  });
});
