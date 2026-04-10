import fs from 'fs';
import path from 'path';
import { getGithubActivity } from './github.js';
import { getJiraActivity } from './jira.js';
import { getConfluenceActivity } from './confluence.js';
import { generateSummary } from './summary.js';
import { saveReport, getReport, getNote } from '../db/cache.js';

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

  const [github, jira, confluence] = await Promise.all([
    Promise.resolve(getGithubActivity(date)),
    getJiraActivity(date).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(`[report] JIRA fetch failed for ${date}, using empty activity:`, err.message);
      return emptyJira;
    }),
    getConfluenceActivity(date).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(`[report] Confluence fetch failed for ${date}, using empty activity:`, err.message);
      return emptyConfluence;
    }),
  ]);

  const note = getNote(date);
  const content = await generateSummary(date, { confluence, github, jira, notes: note?.content ?? '' });

  saveReport(date, content);
  const filePath = writeReportFile(date, content);

  return { content, filePath };
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
