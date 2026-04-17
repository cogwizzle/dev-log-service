import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/db/cache.js', () => ({
  getReport: vi.fn(),
  listReports: vi.fn(() => []),
  saveReport: vi.fn(),
}));
vi.mock('../../src/services/report.js', () => ({
  backfillReports: vi.fn(),
  generateReport: vi.fn(),
  previousBusinessDay: vi.fn(() => '2026-01-01'),
}));
vi.mock('../../src/cron/scheduler.js', () => ({ startScheduler: vi.fn() }));

const { getReport, listReports } = await import('../../src/db/cache.js');
const { backfillReports, generateReport } = await import('../../src/services/report.js');

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
    const res = await request(app).post('/api/reports/generate').send({ date: '2026-01-01' });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('# New Report');
    expect(res.body.date).toBe('2026-01-01');
  });

  it('returns 500 when generation fails', async () => {
    generateReport.mockRejectedValue(new Error('API down'));
    const res = await request(app).post('/api/reports/generate').send({ date: '2026-01-01' });
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('API down');
  });
});

describe('POST /api/reports/backfill', () => {
  it('returns 400 when from is missing', async () => {
    const res = await request(app).post('/api/reports/backfill').send({ to: '2026-01-10' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('from');
  });

  it('returns 400 when to is missing', async () => {
    const res = await request(app).post('/api/reports/backfill').send({ from: '2026-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('to');
  });

  it('returns 400 when from is invalid', async () => {
    const res = await request(app)
      .post('/api/reports/backfill')
      .send({ from: 'bad', to: '2026-01-10' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when from is after to', async () => {
    const res = await request(app)
      .post('/api/reports/backfill')
      .send({ from: '2026-01-10', to: '2026-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('from must be before');
  });

  it('streams NDJSON progress and done summary', async () => {
    backfillReports.mockImplementation(async (_from, _to, opts) => {
      opts.onProgress({ date: '2026-01-02', status: 'generated' });
      opts.onProgress({ date: '2026-01-05', reason: 'already exists', status: 'skipped' });
      return { errors: 0, generated: 1, skipped: 1 };
    });

    const res = await request(app)
      .post('/api/reports/backfill')
      .send({ from: '2026-01-01', to: '2026-01-05' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');

    const lines = res.text
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines[0]).toEqual({ date: '2026-01-02', status: 'generated' });
    expect(lines[1]).toEqual({ date: '2026-01-05', reason: 'already exists', status: 'skipped' });
    expect(lines[2]).toEqual({ done: true, errors: 0, generated: 1, skipped: 1 });
  });

  it('streams error done line when backfill throws', async () => {
    backfillReports.mockRejectedValue(new Error('DB locked'));

    const res = await request(app)
      .post('/api/reports/backfill')
      .send({ from: '2026-01-01', to: '2026-01-02' });

    expect(res.status).toBe(200);
    const lines = res.text
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({ done: true, error: expect.stringContaining('DB locked') });
  });
});
