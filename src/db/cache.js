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
  const row = /** @type {{ data: string, fetched_at: number } | undefined} */ (
    db
      .prepare('SELECT data, fetched_at FROM activity_cache WHERE source = ? AND date = ?')
      .get(source, date)
  );

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
  db.prepare(
    `INSERT INTO activity_cache (source, date, data, fetched_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(source, date) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at`
  ).run(source, date, JSON.stringify(data), Date.now());
}

/**
 * Saves a generated report to the database.
 *
 * @param {string} date - The report date in YYYY-MM-DD format.
 * @param {string} content - The Markdown report content.
 */
export function saveReport(date, content) {
  const db = getDb();
  db.prepare(
    `INSERT INTO reports (date, content, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`
  ).run(date, content, Date.now());
}

/**
 * Retrieves a saved report by date.
 *
 * @param {string} date - The report date in YYYY-MM-DD format.
 * @returns {{ date: string, content: string, created_at: number } | null} The report row or null.
 */
export function getReport(date) {
  const db = getDb();
  return /** @type {{ date: string, content: string, created_at: number } | null} */ (
    db.prepare('SELECT date, content, created_at FROM reports WHERE date = ?').get(date) ?? null
  );
}

/**
 * Lists all saved reports ordered by date descending.
 *
 * @returns {Array<{ date: string, created_at: number }>} Report metadata rows.
 */
export function listReports() {
  const db = getDb();
  return /** @type {Array<{ date: string, created_at: number }>} */ (
    db.prepare('SELECT date, created_at FROM reports ORDER BY date DESC').all()
  );
}

/**
 * @typedef {Object} NoteRow
 * @property {number} id
 * @property {string} date
 * @property {string} content
 * @property {number} created_at
 */

/**
 * Returns all work notes for a given date, ordered by creation time ascending.
 *
 * @param {string} date - Date in YYYY-MM-DD format.
 * @returns {NoteRow[]}
 */
export function getNotesByDate(date) {
  const db = getDb();
  return /** @type {NoteRow[]} */ (
    db
      .prepare(
        'SELECT id, date, content, created_at FROM notes WHERE date = ? ORDER BY created_at ASC'
      )
      .all(date)
  );
}

/**
 * Inserts a single work note for a given date.
 *
 * @param {string} date - Date in YYYY-MM-DD format.
 * @param {string} content - The note text.
 * @returns {NoteRow} The newly created row.
 */
export function addNote(date, content) {
  const db = getDb();
  const created_at = Date.now();
  const result = db
    .prepare('INSERT INTO notes (content, created_at, date) VALUES (?, ?, ?)')
    .run(content, created_at, date);
  return { content, created_at, date, id: Number(result.lastInsertRowid) };
}

/**
 * Deletes a work note by its ID.
 *
 * @param {number} id - The note ID.
 * @returns {boolean} True if a row was deleted.
 */
export function deleteNote(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * @typedef {Object} SummaryRow
 * @property {number} id
 * @property {string} title
 * @property {string} from_date
 * @property {string} to_date
 * @property {string} content
 * @property {number} created_at
 */

/**
 * Saves a generated range summary to the database.
 *
 * @param {string} title
 * @param {string} fromDate - YYYY-MM-DD
 * @param {string} toDate - YYYY-MM-DD
 * @param {string} content - Markdown content
 * @returns {SummaryRow} The inserted row.
 */
export function saveSummary(title, fromDate, toDate, content) {
  const db = getDb();
  const created_at = Date.now();
  const result = db
    .prepare(
      'INSERT INTO summaries (content, created_at, from_date, title, to_date) VALUES (?, ?, ?, ?, ?)'
    )
    .run(content, created_at, fromDate, title, toDate);
  return {
    content,
    created_at,
    from_date: fromDate,
    id: Number(result.lastInsertRowid),
    title,
    to_date: toDate,
  };
}

/**
 * Retrieves a summary by ID.
 *
 * @param {number} id
 * @returns {SummaryRow | null}
 */
export function getSummary(id) {
  const db = getDb();
  return /** @type {SummaryRow | null} */ (
    db
      .prepare(
        'SELECT id, title, from_date, to_date, content, created_at FROM summaries WHERE id = ?'
      )
      .get(id) ?? null
  );
}

/**
 * Lists all summaries ordered by creation date descending.
 *
 * @returns {Array<{ id: number, title: string, from_date: string, to_date: string, created_at: number }>}
 */
export function listSummaries() {
  const db = getDb();
  return /** @type {Array<{ id: number, title: string, from_date: string, to_date: string, created_at: number }>} */ (
    db
      .prepare(
        'SELECT id, title, from_date, to_date, created_at FROM summaries ORDER BY created_at DESC'
      )
      .all()
  );
}

/**
 * Deletes a summary by ID.
 *
 * @param {number} id
 * @returns {boolean}
 */
export function deleteSummary(id) {
  return getDb().prepare('DELETE FROM summaries WHERE id = ?').run(id).changes > 0;
}

/**
 * Returns all notes for a date as a single newline-separated string,
 * suitable for inclusion in the AI summary prompt.
 *
 * @param {string} date - Date in YYYY-MM-DD format.
 * @returns {string}
 */
export function getNotesAsText(date) {
  return getNotesByDate(date)
    .map((n) => `- ${n.content}`)
    .join('\n');
}
