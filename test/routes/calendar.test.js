import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/calendar.js', () => ({ getCalendarActivity: vi.fn() }));
vi.mock('../../src/db/cache.js', () => ({
  addNote: vi.fn(),
  deleteNote: vi.fn(),
  getNotesByDate: vi.fn(() => []),
  getNotesAsText: vi.fn(() => ''),
  getReport: vi.fn(() => null),
  listReports: vi.fn(() => []),
  saveReport: vi.fn(),
}));
vi.mock('../../src/cron/scheduler.js', () => ({ startScheduler: vi.fn() }));

const { getCalendarActivity } = await import('../../src/services/calendar.js');
const { default: app } = await import('../../src/server.js');

beforeEach(() => vi.clearAllMocks());

describe('GET /api/calendar', () => {
  it('returns 400 for invalid date', async () => {
    const res = await request(app).get('/api/calendar?date=nope');
    expect(res.status).toBe(400);
  });

  it('returns calendar activity', async () => {
    const activity = { meetingCount: 2, meetings: [], totalHours: 1.5 };
    getCalendarActivity.mockResolvedValue(activity);
    const res = await request(app).get('/api/calendar?date=2026-01-01');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activity, date: '2026-01-01' });
  });

  it('returns 500 when service throws', async () => {
    getCalendarActivity.mockRejectedValue(new Error('ICS fetch failed'));
    const res = await request(app).get('/api/calendar?date=2026-01-01');
    expect(res.status).toBe(500);
  });
});
