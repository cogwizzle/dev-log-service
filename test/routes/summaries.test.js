import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/db/cache.js', () => ({
  addNote: vi.fn(),
  deleteNote: vi.fn(),
  deleteSummary: vi.fn(),
  getNotesByDate: vi.fn(() => []),
  getNotesAsText: vi.fn(() => ''),
  getReport: vi.fn(() => null),
  getSummary: vi.fn(),
  listReports: vi.fn(() => []),
  listSummaries: vi.fn(() => []),
  saveReport: vi.fn(),
  saveSummary: vi.fn(),
}));
vi.mock('../../src/services/rangeSummary.js', () => ({ generateRangeSummary: vi.fn() }));
vi.mock('../../src/cron/scheduler.js', () => ({ startScheduler: vi.fn() }));

const { deleteSummary, getSummary, listSummaries, saveSummary } =
  await import('../../src/db/cache.js');
const { generateRangeSummary } = await import('../../src/services/rangeSummary.js');
const { default: app } = await import('../../src/server.js');

beforeEach(() => vi.clearAllMocks());

describe('GET /api/summaries', () => {
  it('returns empty list', async () => {
    listSummaries.mockReturnValue([]);
    const res = await request(app).get('/api/summaries');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ summaries: [] });
  });

  it('returns list of summaries', async () => {
    listSummaries.mockReturnValue([
      { created_at: 0, from_date: '2026-01-01', id: 1, title: 'Week 1', to_date: '2026-01-05' },
    ]);
    const res = await request(app).get('/api/summaries');
    expect(res.status).toBe(200);
    expect(res.body.summaries).toHaveLength(1);
  });
});

describe('GET /api/summaries/:id', () => {
  it('returns 400 for invalid id', async () => {
    const res = await request(app).get('/api/summaries/abc');
    expect(res.status).toBe(400);
  });

  it('returns 404 when not found', async () => {
    getSummary.mockReturnValue(null);
    const res = await request(app).get('/api/summaries/99');
    expect(res.status).toBe(404);
  });

  it('returns summary', async () => {
    getSummary.mockReturnValue({
      content: '# Summary',
      created_at: 0,
      from_date: '2026-01-01',
      id: 1,
      title: 'Week 1',
      to_date: '2026-01-05',
    });
    const res = await request(app).get('/api/summaries/1');
    expect(res.status).toBe(200);
    expect(res.body.summary.title).toBe('Week 1');
  });
});

describe('POST /api/summaries/generate', () => {
  it('returns 400 for missing title', async () => {
    const res = await request(app)
      .post('/api/summaries/generate')
      .send({ from: '2026-01-01', to: '2026-01-05' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid from date', async () => {
    const res = await request(app)
      .post('/api/summaries/generate')
      .send({ from: 'bad', title: 'Test', to: '2026-01-05' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when from is after to', async () => {
    const res = await request(app)
      .post('/api/summaries/generate')
      .send({ from: '2026-01-10', title: 'Test', to: '2026-01-05' });
    expect(res.status).toBe(400);
  });

  it('generates and returns summary', async () => {
    generateRangeSummary.mockResolvedValue('# Week 1 Summary');
    saveSummary.mockReturnValue({
      content: '# Week 1 Summary',
      created_at: 0,
      from_date: '2026-01-01',
      id: 1,
      title: 'Week 1',
      to_date: '2026-01-05',
    });
    const res = await request(app)
      .post('/api/summaries/generate')
      .send({ from: '2026-01-01', title: 'Week 1', to: '2026-01-05' });
    expect(res.status).toBe(201);
    expect(res.body.summary.id).toBe(1);
    expect(saveSummary).toHaveBeenCalledWith(
      'Week 1',
      '2026-01-01',
      '2026-01-05',
      '# Week 1 Summary'
    );
  });

  it('returns 500 when generation fails', async () => {
    generateRangeSummary.mockRejectedValue(new Error('No reports found'));
    const res = await request(app)
      .post('/api/summaries/generate')
      .send({ from: '2026-01-01', title: 'Test', to: '2026-01-05' });
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/summaries/:id', () => {
  it('returns 400 for invalid id', async () => {
    const res = await request(app).delete('/api/summaries/abc');
    expect(res.status).toBe(400);
  });

  it('returns 404 when not found', async () => {
    deleteSummary.mockReturnValue(false);
    const res = await request(app).delete('/api/summaries/99');
    expect(res.status).toBe(404);
  });

  it('returns 204 on success', async () => {
    deleteSummary.mockReturnValue(true);
    const res = await request(app).delete('/api/summaries/1');
    expect(res.status).toBe(204);
  });
});
