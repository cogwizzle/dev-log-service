import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/db/cache.js', () => ({
  addNote: vi.fn(),
  deleteNote: vi.fn(),
  getNote: vi.fn(),
  getNotesByDate: vi.fn(() => []),
  getNotesAsText: vi.fn(() => ''),
  getReport: vi.fn(() => null),
  listReports: vi.fn(() => []),
  saveReport: vi.fn(),
}));
vi.mock('../../src/cron/scheduler.js', () => ({ startScheduler: vi.fn() }));

const { addNote, deleteNote, getNotesByDate } = await import('../../src/db/cache.js');
const { default: app } = await import('../../src/server.js');

beforeEach(() => vi.clearAllMocks());

describe('GET /api/notes/:date', () => {
  it('returns 400 for invalid date', async () => {
    const res = await request(app).get('/api/notes/bad');
    expect(res.status).toBe(400);
  });

  it('returns empty notes list when none exist', async () => {
    getNotesByDate.mockReturnValue([]);
    const res = await request(app).get('/api/notes/2026-01-01');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ date: '2026-01-01', notes: [] });
  });

  it('returns existing notes', async () => {
    getNotesByDate.mockReturnValue([
      { content: 'Investigated bug', created_at: 0, date: '2026-01-01', id: 1 },
    ]);
    const res = await request(app).get('/api/notes/2026-01-01');
    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.notes[0].content).toBe('Investigated bug');
  });
});

describe('POST /api/notes/:date', () => {
  it('returns 400 for invalid date', async () => {
    const res = await request(app).post('/api/notes/bad').send({ content: 'hello' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when content is missing', async () => {
    const res = await request(app).post('/api/notes/2026-01-01').send({});
    expect(res.status).toBe(400);
  });

  it('adds and returns the new note', async () => {
    const note = { content: 'Did some investigation', created_at: 0, date: '2026-01-01', id: 1 };
    addNote.mockReturnValue(note);
    const res = await request(app)
      .post('/api/notes/2026-01-01')
      .send({ content: 'Did some investigation' });
    expect(res.status).toBe(201);
    expect(res.body.note.content).toBe('Did some investigation');
    expect(addNote).toHaveBeenCalledWith('2026-01-01', 'Did some investigation');
  });
});

describe('DELETE /api/notes/:id', () => {
  it('returns 400 for non-integer id', async () => {
    const res = await request(app).delete('/api/notes/abc');
    expect(res.status).toBe(400);
  });

  it('returns 404 when note not found', async () => {
    deleteNote.mockReturnValue(false);
    const res = await request(app).delete('/api/notes/99');
    expect(res.status).toBe(404);
  });

  it('returns 204 on successful delete', async () => {
    deleteNote.mockReturnValue(true);
    const res = await request(app).delete('/api/notes/1');
    expect(res.status).toBe(204);
    expect(deleteNote).toHaveBeenCalledWith(1);
  });
});
