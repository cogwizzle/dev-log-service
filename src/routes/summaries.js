import { Router } from 'express';
import { deleteSummary, getSummary, listSummaries, saveSummary } from '../db/cache.js';
import { generateRangeSummary } from '../services/rangeSummary.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/summaries
 *
 * Lists all saved range summaries ordered by creation date descending.
 *
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 */
router.get('/', (_req, res) => {
  try {
    return res.json({ summaries: listSummaries() });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/summaries/:id
 *
 * Returns a single saved summary by ID.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'id must be a positive integer' });
  }
  const summary = getSummary(id);
  if (!summary) {
    return res.status(404).json({ error: `No summary found with id ${id}` });
  }
  return res.json({ summary });
});

/**
 * POST /api/summaries/generate
 *
 * Generates and saves a new range summary.
 *
 * Body: { title: string, from: string, to: string }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
router.post('/generate', async (req, res) => {
  const { from, title, to } = req.body ?? {};

  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!DATE_RE.test(from)) {
    return res.status(400).json({ error: 'from must be in YYYY-MM-DD format' });
  }
  if (!DATE_RE.test(to)) {
    return res.status(400).json({ error: 'to must be in YYYY-MM-DD format' });
  }
  if (from > to) {
    return res.status(400).json({ error: 'from must be before or equal to to' });
  }

  try {
    const content = await generateRangeSummary(String(title).trim(), from, to);
    const summary = saveSummary(String(title).trim(), from, to, content);
    return res.status(201).json({ summary });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

/**
 * DELETE /api/summaries/:id
 *
 * Deletes a saved summary by ID.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'id must be a positive integer' });
  }
  if (!deleteSummary(id)) {
    return res.status(404).json({ error: `No summary found with id ${id}` });
  }
  return res.status(204).send();
});

export default router;
