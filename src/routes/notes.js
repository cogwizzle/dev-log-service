import { Router } from 'express';
import { addNote, deleteNote, getNotesByDate } from '../db/cache.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/notes/:date
 *
 * Returns all work notes for the given date ordered by creation time.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
router.get('/:date', (req, res) => {
  const { date } = req.params;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }
  return res.json({ date, notes: getNotesByDate(date) });
});

/**
 * POST /api/notes/:date
 *
 * Adds a single work note for the given date.
 *
 * Body: { content: string }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
router.post('/:date', (req, res) => {
  const { date } = req.params;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }
  const content = String(req.body?.content ?? '').trim();
  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }
  const note = addNote(date, content);
  return res.status(201).json({ note });
});

/**
 * DELETE /api/notes/:id
 *
 * Deletes a work note by its numeric ID.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'id must be a positive integer' });
  }
  const deleted = deleteNote(id);
  if (!deleted) {
    return res.status(404).json({ error: `Note ${id} not found` });
  }
  return res.status(204).send();
});

export default router;
