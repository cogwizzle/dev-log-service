import { Router } from 'express';
import { generateReport } from '../services/report.js';
import { getReport, listReports } from '../db/cache.js';

const router = Router();

/**
 * GET /api/reports
 *
 * Lists all saved reports ordered by date descending.
 *
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 */
router.get('/', (_req, res) => {
  try {
    const reports = listReports();
    return res.json({ reports });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/reports/:date
 *
 * Returns the saved report for a specific date.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
router.get('/:date', (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }
  const report = getReport(date);
  if (!report) {
    return res.status(404).json({ error: `No report found for ${date}` });
  }
  return res.json({ content: report.content, created_at: report.created_at, date: report.date });
});

/**
 * POST /api/reports/generate
 *
 * Generates (or regenerates) a report for the given date.
 *
 * Body: { date: string, force?: boolean }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
router.post('/generate', async (req, res) => {
  const date = String(req.body?.date || '');
  const force = Boolean(req.body?.force);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }
  try {
    const { content, filePath } = await generateReport(date, { force });
    return res.json({ content, date, filePath });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
