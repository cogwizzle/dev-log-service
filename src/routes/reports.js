import { Router } from 'express';
import { backfillReports, generateReport } from '../services/report.js';
import { getReport, listReports } from '../db/cache.js';

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!DATE_RE.test(date)) {
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
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }
  try {
    const { content, filePath } = await generateReport(date, { force });
    return res.json({ content, date, filePath });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/reports/backfill
 *
 * Generates reports for every business day in the given date range.
 *
 * Streams progress as newline-delimited JSON (NDJSON). Each line is a JSON
 * object with one of these shapes:
 *   - `{ date, status: 'generated' | 'skipped', reason? }`  — per-date progress
 *   - `{ status: 'error', reason: string }`                  — per-date error
 *   - `{ done: true, errors, generated, skipped }`           — final summary
 *
 * Body: { from: string, to: string, force?: boolean }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
router.post('/backfill', async (req, res) => {
  const { force, from, to } = req.body ?? {};

  if (!DATE_RE.test(from)) {
    return res.status(400).json({ error: 'from must be in YYYY-MM-DD format' });
  }
  if (!DATE_RE.test(to)) {
    return res.status(400).json({ error: 'to must be in YYYY-MM-DD format' });
  }
  if (from > to) {
    return res.status(400).json({ error: 'from must be before or equal to to' });
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  try {
    const totals = await backfillReports(from, to, {
      force: Boolean(force),
      onProgress: (p) => res.write(JSON.stringify(p) + '\n'),
    });
    res.write(JSON.stringify({ done: true, ...totals }) + '\n');
  } catch (err) {
    res.write(JSON.stringify({ done: true, error: String(err) }) + '\n');
  }

  return res.end();
});

export default router;
