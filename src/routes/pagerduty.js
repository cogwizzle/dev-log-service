import { Router } from 'express';
import { getPagerDutyActivity, getRawOnCalls } from '../services/pagerduty.js';

const router = Router();

/**
 * Returns yesterday's date in YYYY-MM-DD format.
 *
 * @returns {string}
 */
function previousDay() {
  return new Date(Date.now() - 86400000).toISOString().split('T')[0];
}

/**
 * GET /api/pagerduty
 *
 * Returns PagerDuty incident activity for the given date.
 *
 * Query params:
 *   - date (optional) — YYYY-MM-DD, defaults to yesterday
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
router.get('/', async (req, res) => {
  const date = String(req.query.date || previousDay());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }
  try {
    const activity = await getPagerDutyActivity(date);
    return res.json({ activity, date });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/pagerduty/debug
 *
 * Returns the raw on-call schedule entries for the given date directly from
 * the PagerDuty API, bypassing the cache. Useful for diagnosing why incidents
 * are not appearing in reports.
 *
 * Query params:
 *   - date (optional) — YYYY-MM-DD, defaults to yesterday
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
router.get('/debug', async (req, res) => {
  const date = String(req.query.date || previousDay());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }
  try {
    const oncalls = await getRawOnCalls(date);
    return res.json({ date, oncalls });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
