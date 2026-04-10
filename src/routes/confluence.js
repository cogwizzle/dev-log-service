import { Router } from 'express';
import { getConfluenceActivity } from '../services/confluence.js';

const router = Router();

/**
 * GET /api/confluence
 *
 * Returns Confluence activity for the given date.
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
    const activity = await getConfluenceActivity(date);
    return res.json({ activity, date });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

/**
 * Returns yesterday's date in YYYY-MM-DD format.
 *
 * @returns {string}
 */
function previousDay() {
  return new Date(Date.now() - 86400000).toISOString().split('T')[0];
}

export default router;
