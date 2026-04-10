import { getDb } from './index.js';

/** Cache TTL in milliseconds (1 hour). */
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Retrieves a cached activity payload if it exists and has not expired.
 *
 * @param {string} source - The data source identifier (e.g. 'github', 'jira', 'confluence').
 * @param {string} date - The activity date in YYYY-MM-DD format.
 * @returns {unknown | null} The parsed cached data, or null on a cache miss or expiry.
 */
export function getCached(source, date) {
  const db = getDb();
  const row = db
    .prepare('SELECT data, fetched_at FROM activity_cache WHERE source = ? AND date = ?')
    .get(source, date);

  if (!row) return null;
  if (Date.now() - row.fetched_at > CACHE_TTL_MS) return null;
  return JSON.parse(row.data);
}

/**
 * Inserts or replaces a cached activity payload.
 *
 * @param {string} source - The data source identifier.
 * @param {string} date - The activity date in YYYY-MM-DD format.
 * @param {unknown} data - The data to cache. Will be JSON-serialized.
 */
export function setCached(source, date, data) {
  const db = getDb();
  db
    .prepare(
      `INSERT INTO activity_cache (source, date, data, fetched_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(source, date) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at`
    )
    .run(source, date, JSON.stringify(data), Date.now());
}

/**
 * Saves a generated report to the database.
 *
 * @param {string} date - The report date in YYYY-MM-DD format.
 * @param {string} content - The Markdown report content.
 */
export function saveReport(date, content) {
  const db = getDb();
  db
    .prepare(
      `INSERT INTO reports (date, content, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`
    )
    .run(date, content, Date.now());
}

/**
 * Retrieves a saved report by date.
 *
 * @param {string} date - The report date in YYYY-MM-DD format.
 * @returns {{ date: string, content: string, created_at: number } | null} The report row or null.
 */
export function getReport(date) {
  const db = getDb();
  return db.prepare('SELECT date, content, created_at FROM reports WHERE date = ?').get(date) ?? null;
}

/**
 * Lists all saved reports ordered by date descending.
 *
 * @returns {Array<{ date: string, created_at: number }>} Report metadata rows.
 */
export function listReports() {
  const db = getDb();
  return db.prepare('SELECT date, created_at FROM reports ORDER BY date DESC').all();
}
