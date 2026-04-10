import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/db/cache.js', () => ({
  getNote: vi.fn(),
  getReport: vi.fn(() => null),
  listReports: vi.fn(() => []),
  saveNote: vi.fn(),
  saveReport: vi.fn(),
}));
vi.mock('../../src/cron/scheduler.js', () => ({ startScheduler: vi.fn() }));

const { getNote, saveNote } = await import('../../src/db/cache.js');
const { default: app } = await import('../../src/server.js');

beforeEach(() => vi.clearAllMocks());

describe('GET /api/notes/:date', () => {
  it('returns 400 for invalid date', async () => {
    const res = await request(app).get('/api/notes/bad');
    expect(res.status).toBe(400);
  });

  it('returns empty content when no note exists', async () => {
    getNote.mockReturnValue(null);
    const res = await request(app).get('/api/notes/2026-01-01');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ content: '', date: '2026-01-01' });
  });

  it('returns existing note content', async () => {
    getNote.mockReturnValue({ content: 'Investigated bug', date: '2026-01-01', updated_at: 0 });
    const res = await request(app).get('/api/notes/2026-01-01');
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Investigated bug');
  });
});

describe('PUT /api/notes/:date', () => {
  it('returns 400 for invalid date', async () => {
    const res = await request(app).put('/api/notes/bad').send({ content: 'hello' });
    expect(res.status).toBe(400);
  });

  it('saves and returns the note', async () => {
    const res = await request(app)
      .put('/api/notes/2026-01-01')
      .send({ content: 'Did some investigation' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ content: 'Did some investigation', date: '2026-01-01' });
    expect(saveNote).toHaveBeenCalledWith('2026-01-01', 'Did some investigation');
  });

  it('saves empty string when content is missing', async () => {
    const res = await request(app).put('/api/notes/2026-01-01').send({});
    expect(res.status).toBe(200);
    expect(saveNote).toHaveBeenCalledWith('2026-01-01', '');
  });
});
