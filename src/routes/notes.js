import { Router } from 'express';
import { getNote, saveNote } from '../db/cache.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/notes/:date
 *
 * Returns the work note for the given date, or an empty string if none exists.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
router.get('/:date', (req, res) => {
  const { date } = req.params;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }
  const note = getNote(date);
  return res.json({ content: note?.content ?? '', date });
});

/**
 * PUT /api/notes/:date
 *
 * Saves the work note for the given date.
 *
 * Body: { content: string }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
router.put('/:date', (req, res) => {
  const { date } = req.params;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }
  const content = String(req.body?.content ?? '');
  saveNote(date, content);
  return res.json({ content, date });
});

export default router;
