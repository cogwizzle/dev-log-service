import fs from 'fs';
import path from 'path';
import { getCalendarActivity } from './calendar.js';
import { getGithubActivity } from './github.js';
import { getJiraActivity } from './jira.js';
import { getConfluenceActivity } from './confluence.js';
import { generateSummary } from './summary.js';
import { saveReport, getReport, getNotesAsText } from '../db/cache.js';

/**
 * Returns the absolute path to the reports output directory.
 *
 * Resolves relative paths against the project root.
 *
 * @returns {string}
 */
function reportsDir() {
  const configured = process.env.REPORTS_DIR || '../dev-log';
  return path.resolve(process.cwd(), configured);
}

/**
 * Writes the report Markdown file to the reports directory.
 *
 * @param {string} date - Date in YYYY-MM-DD format.
 * @param {string} content - Markdown content to write.
 * @returns {string} The absolute path of the written file.
 */
function writeReportFile(date, content) {
  const dir = reportsDir();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${date}.md`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Collects activity from all sources for the given date and generates a Markdown report.
 *
 * Fetches GitHub, JIRA, and Confluence activity in parallel, passes it to the AI
 * summarization service, saves the result to SQLite and the reports directory, and
 * returns the generated Markdown content.
 *
 * If a report already exists in the database for this date it is returned immediately
 * without re-fetching, unless `force` is true.
 *
 * @param {string} date - Date in YYYY-MM-DD format.
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<{ content: string, filePath: string }>}
 */
export async function generateReport(date, options = {}) {
  if (!options.force) {
    const existing = getReport(date);
    if (existing) {
      const filePath = path.join(reportsDir(), `${date}.md`);
      return { content: existing.content, filePath };
    }
  }

  const emptyJira = { commentedIssues: [], createdIssues: [], updatedIssues: [] };
  const emptyConfluence = { comments: [], createdPages: [], updatedPages: [] };
  const emptyCalendar = { meetingCount: 0, meetings: [], totalHours: 0 };

  const [github, jira, confluence, calendar] = await Promise.all([
    Promise.resolve(getGithubActivity(date)),
    getJiraActivity(date).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(`[report] JIRA fetch failed for ${date}, using empty activity:`, err.message);
      return emptyJira;
    }),
    getConfluenceActivity(date).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(
        `[report] Confluence fetch failed for ${date}, using empty activity:`,
        err.message
      );
      return emptyConfluence;
    }),
    getCalendarActivity(date).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(
        `[report] Calendar fetch failed for ${date}, using empty activity:`,
        err.message
      );
      return emptyCalendar;
    }),
  ]);

  const content = await generateSummary(date, {
    calendar,
    confluence,
    github,
    jira,
    notes: getNotesAsText(date),
  });

  saveReport(date, content);
  const filePath = writeReportFile(date, content);

  return { content, filePath };
}

/**
 * @typedef {Object} BackfillProgress
 * @property {string} date - The date being processed.
 * @property {'skipped' | 'generated' | 'error'} status - Outcome for this date.
 * @property {string} [reason] - Human-readable detail (e.g. "already exists", error message).
 */

/**
 * Returns all business days (Mon–Fri) between from and to inclusive.
 *
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 * @returns {string[]}
 */
export function businessDaysInRange(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().split('T')[0]);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Generates reports for every business day in the given date range.
 *
 * Skips dates that already have a saved report unless `force` is true. Calls
 * `onProgress` after each date so callers can stream results to clients.
 *
 * @param {string} from - Start date in YYYY-MM-DD format.
 * @param {string} to - End date in YYYY-MM-DD format.
 * @param {{ force?: boolean, onProgress?: (p: BackfillProgress) => void }} [options]
 * @returns {Promise<{ errors: number, generated: number, skipped: number }>}
 */
export async function backfillReports(from, to, options = {}) {
  const dates = businessDaysInRange(from, to);
  let errors = 0;
  let generated = 0;
  let skipped = 0;

  for (const date of dates) {
    if (!options.force && getReport(date)) {
      options.onProgress?.({ date, reason: 'already exists', status: 'skipped' });
      skipped++;
      continue;
    }

    try {
      await generateReport(date, { force: options.force });
      options.onProgress?.({ date, status: 'generated' });
      generated++;
    } catch (err) {
      options.onProgress?.({ date, reason: String(err), status: 'error' });
      errors++;
    }
  }

  return { errors, generated, skipped };
}

/**
 * Returns the previous business day date string relative to the given date.
 *
 * Monday returns Friday. Other weekdays return the day before.
 *
 * @param {Date} [from] - Reference date, defaults to now.
 * @returns {string} Date in YYYY-MM-DD format.
 */
export function previousBusinessDay(from = new Date()) {
  const d = new Date(from);
  const day = d.getDay();
  // Sunday = 0, Monday = 1, Saturday = 6
  const daysBack = day === 1 ? 3 : day === 0 ? 2 : 1;
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().split('T')[0];
}
