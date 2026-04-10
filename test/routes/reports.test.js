import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/db/cache.js', () => ({
  getReport: vi.fn(),
  listReports: vi.fn(() => []),
  saveReport: vi.fn(),
}));
vi.mock('../../src/services/report.js', () => ({
  generateReport: vi.fn(),
  previousBusinessDay: vi.fn(() => '2026-01-01'),
}));
vi.mock('../../src/cron/scheduler.js', () => ({ startScheduler: vi.fn() }));

const { getReport, listReports } = await import('../../src/db/cache.js');
const { generateReport } = await import('../../src/services/report.js');

// Import app after mocks are set up
const { default: app } = await import('../../src/server.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/reports', () => {
  it('returns empty reports list', async () => {
    listReports.mockReturnValue([]);
    const res = await request(app).get('/api/reports');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reports: [] });
  });

  it('returns list of reports', async () => {
    listReports.mockReturnValue([{ created_at: 1234567890, date: '2026-01-01' }]);
    const res = await request(app).get('/api/reports');
    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(1);
  });
});

describe('GET /api/reports/:date', () => {
  it('returns 400 for invalid date format', async () => {
    const res = await request(app).get('/api/reports/not-a-date');
    expect(res.status).toBe(400);
  });

  it('returns 404 when report not found', async () => {
    getReport.mockReturnValue(null);
    const res = await request(app).get('/api/reports/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('returns report content', async () => {
    getReport.mockReturnValue({ content: '# Report', created_at: 0, date: '2026-01-01' });
    const res = await request(app).get('/api/reports/2026-01-01');
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('# Report');
  });
});

describe('POST /api/reports/generate', () => {
  it('returns 400 for missing date', async () => {
    const res = await request(app).post('/api/reports/generate').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid date format', async () => {
    const res = await request(app).post('/api/reports/generate').send({ date: 'bad' });
    expect(res.status).toBe(400);
  });

  it('generates and returns report', async () => {
    generateReport.mockResolvedValue({ content: '# New Report', filePath: '/tmp/2026-01-01.md' });
    const res = await request(app)
      .post('/api/reports/generate')
      .send({ date: '2026-01-01' });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('# New Report');
    expect(res.body.date).toBe('2026-01-01');
  });

  it('returns 500 when generation fails', async () => {
    generateReport.mockRejectedValue(new Error('API down'));
    const res = await request(app)
      .post('/api/reports/generate')
      .send({ date: '2026-01-01' });
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('API down');
  });
});
