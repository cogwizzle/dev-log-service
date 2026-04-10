#!/usr/bin/env node

/**
 * Backfill script — generates merged reports for every business day from
 * Jan 1 2026 through yesterday, skipping US federal holidays.
 *
 * For each date:
 *   1. Fetch activity from GitHub, JIRA, Confluence, and Calendar APIs
 *   2. Read the existing handwritten report from REPORTS_DIR if one exists
 *   3. Pass both to Claude, which merges them into a single polished report
 *   4. Save to the dev-log-service database and to REPORTS_DIR
 *
 * Usage:
 *   npm run backfill
 *   npm run backfill -- --from=2026-03-01   # start from a specific date
 *   npm run backfill -- --dry-run           # print dates only, no API calls
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import { getGithubActivity } from '../src/services/github.js';
import { getJiraActivity } from '../src/services/jira.js';
import { getConfluenceActivity } from '../src/services/confluence.js';
import { getCalendarActivity } from '../src/services/calendar.js';
import { saveReport, getReport } from '../src/db/cache.js';

const client = new AnthropicBedrock();

// ---------------------------------------------------------------------------
// US Federal Holidays 2026
// ---------------------------------------------------------------------------
const HOLIDAYS_2026 = new Set([
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day (3rd Monday of January)
  '2026-02-16', // Presidents' Day (3rd Monday of February)
  '2026-05-25', // Memorial Day (last Monday of May)
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day observed (July 4 is Saturday)
  '2026-09-07', // Labor Day (1st Monday of September)
  '2026-10-12', // Columbus Day (2nd Monday of October)
  '2026-11-11', // Veterans Day
  '2026-11-26', // Thanksgiving (4th Thursday of November)
  '2026-11-27', // Day after Thanksgiving (Twilio observed)
  '2026-12-25', // Christmas Day
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns all business days from startDate up to and including endDate,
 * skipping weekends and US federal holidays.
 *
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {string[]}
 */
function businessDays(startDate, endDate) {
  const dates = [];
  const cursor = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);

  while (cursor <= end) {
    const day = cursor.getUTCDay();
    const iso = cursor.toISOString().split('T')[0];
    if (day !== 0 && day !== 6 && !HOLIDAYS_2026.has(iso)) {
      dates.push(iso);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Reads the existing handwritten report for the date from REPORTS_DIR,
 * or returns null if none exists.
 *
 * @param {string} date
 * @returns {string | null}
 */
function readExistingReport(date) {
  const dir = path.resolve(process.cwd(), process.env.REPORTS_DIR || '../dev-log');
  const filePath = path.join(dir, `${date}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8').trim();
}

/**
 * Writes the merged report to REPORTS_DIR.
 *
 * @param {string} date
 * @param {string} content
 */
function writeReport(date, content) {
  const dir = path.resolve(process.cwd(), process.env.REPORTS_DIR || '../dev-log');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${date}.md`), content, 'utf-8');
}

/**
 * Returns true if all API activity is completely empty.
 *
 * @param {object} activity
 * @returns {boolean}
 */
function isEmptyActivity(activity) {
  const { calendar, confluence, github, jira } = activity;
  return (
    github.authoredPRs.length === 0 &&
    github.commentedPRs.length === 0 &&
    github.commits.length === 0 &&
    github.reviewedPRs.length === 0 &&
    jira.createdIssues.length === 0 &&
    jira.updatedIssues.length === 0 &&
    jira.commentedIssues.length === 0 &&
    confluence.createdPages.length === 0 &&
    confluence.updatedPages.length === 0 &&
    confluence.comments.length === 0 &&
    calendar.meetingCount === 0
  );
}

/**
 * Builds the merge prompt for Claude.
 *
 * @param {string} date
 * @param {string | null} existing - Handwritten report content, if any.
 * @param {object} activity - API activity bundle.
 * @returns {string}
 */
function buildMergePrompt(date, existing, activity) {
  const { calendar, confluence, github, jira } = activity;
  const lines = [];

  lines.push(`Generate a developer activity report in Markdown for ${date}.`);
  lines.push('');
  lines.push('Use this exact format with reference-style links at the bottom:');
  lines.push('');
  lines.push('```markdown');
  lines.push(`# What I did ${date}`);
  lines.push('');
  lines.push('<narrative summary paragraph>');
  lines.push('');
  lines.push('## Section Name');
  lines.push('');
  lines.push('- [Item][Ref]');
  lines.push('');
  lines.push('[Ref]: https://url');
  lines.push('```');
  lines.push('');
  lines.push('Rules:');
  lines.push('- The handwritten report is the source of truth. Preserve all its content exactly.');
  lines.push('- Supplement with API data only for things NOT already mentioned.');
  lines.push('- Use natural, human-readable section names.');
  lines.push('- Only include sections that have data.');
  lines.push('- Use reference-style Markdown links at the bottom.');
  lines.push('- Write a short narrative summary at the top.');
  lines.push('- Do not invent or assume anything not present in the source material.');
  lines.push('');

  if (existing) {
    lines.push('## Handwritten Report (source of truth)');
    lines.push('');
    lines.push(existing);
    lines.push('');
  }

  lines.push('## API Activity Data');
  lines.push('');

  lines.push('### Calendar');
  if (calendar.meetingCount > 0) {
    lines.push(`${calendar.meetingCount} meetings, ${calendar.totalHours}h total:`);
    calendar.meetings.forEach((m) => {
      const start = new Date(m.start);
      const end = new Date(m.end);
      const time = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}–${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`;
      lines.push(`- ${m.title} (${time})`);
    });
  } else {
    lines.push('No meetings.');
  }
  lines.push('');

  lines.push('### GitHub');
  if (github.authoredPRs.length) {
    lines.push('Authored PRs:');
    github.authoredPRs.forEach((pr) => lines.push(`- [${pr.title}](${pr.url}) [${pr.state}]`));
  }
  if (github.reviewedPRs.length) {
    lines.push('Reviewed PRs:');
    github.reviewedPRs.forEach((pr) => lines.push(`- [${pr.title}](${pr.url}) [${pr.state}]`));
  }
  if (github.commentedPRs.length) {
    lines.push('Commented PRs:');
    github.commentedPRs.forEach((pr) => lines.push(`- [${pr.title}](${pr.url}) [${pr.state}]`));
  }
  if (github.commits.length) {
    lines.push('Commits:');
    github.commits.forEach((c) => lines.push(`- ${c.repository}: ${c.message.split('\n')[0]}`));
  }
  if (
    !github.authoredPRs.length &&
    !github.reviewedPRs.length &&
    !github.commentedPRs.length &&
    !github.commits.length
  ) {
    lines.push('No GitHub activity.');
  }
  lines.push('');

  lines.push('### JIRA');
  if (jira.createdIssues.length) {
    lines.push('Created:');
    jira.createdIssues.forEach((i) => lines.push(`- [${i.key}](${i.url}): ${i.summary} [${i.status}]`));
  }
  if (jira.updatedIssues.length) {
    lines.push('Updated:');
    jira.updatedIssues.forEach((i) => lines.push(`- [${i.key}](${i.url}): ${i.summary} [${i.status}]`));
  }
  if (jira.commentedIssues.length) {
    lines.push('Commented:');
    jira.commentedIssues.forEach((i) => lines.push(`- [${i.key}](${i.url}): ${i.summary} [${i.status}]`));
  }
  if (!jira.createdIssues.length && !jira.updatedIssues.length && !jira.commentedIssues.length) {
    lines.push('No JIRA activity.');
  }
  lines.push('');

  lines.push('### Confluence');
  if (confluence.createdPages.length) {
    lines.push('Created pages:');
    confluence.createdPages.forEach((p) => lines.push(`- [${p.title}](${p.url})`));
  }
  if (confluence.updatedPages.length) {
    lines.push('Updated pages:');
    confluence.updatedPages.forEach((p) => lines.push(`- [${p.title}](${p.url})`));
  }
  if (confluence.comments.length) {
    lines.push('Comments:');
    confluence.comments.forEach((c) => lines.push(`- Comment on [${c.pageTitle}](${c.pageUrl})`));
  }
  if (!confluence.createdPages.length && !confluence.updatedPages.length && !confluence.comments.length) {
    lines.push('No Confluence activity.');
  }

  return lines.join('\n');
}

/**
 * Calls Claude to merge the handwritten and API-sourced content.
 *
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function mergeWithClaude(prompt) {
  const message = await client.messages.create({
    max_tokens: 2048,
    messages: [{ content: prompt, role: 'user' }],
    model: process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  });
  const block = message.content.find((b) => b.type === 'text');
  return block?.type === 'text' ? block.text : '';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fromArg = args.find((a) => a.startsWith('--from='))?.split('=')[1];

const START = fromArg || '2026-01-01';
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
const dates = businessDays(START, yesterday);

console.log(`Backfilling ${dates.length} business days from ${START} to ${yesterday}${dryRun ? ' (dry run)' : ''}`);

if (dryRun) {
  dates.forEach((d) => console.log(d));
  process.exit(0);
}

let generated = 0;
let skipped = 0;
let alreadyExists = 0;

for (const date of dates) {
  // Skip if already in the database
  const existing_db = getReport(date);
  if (existing_db) {
    console.log(`  skip  ${date} (already in database)`);
    alreadyExists++;
    continue;
  }

  process.stdout.write(`  fetch ${date} ... `);

  const emptyJira = { commentedIssues: [], createdIssues: [], updatedIssues: [] };
  const emptyConfluence = { comments: [], createdPages: [], updatedPages: [] };
  const emptyCalendar = { meetingCount: 0, meetings: [], totalHours: 0 };

  const [github, jira, confluence, calendar] = await Promise.all([
    Promise.resolve(getGithubActivity(date)),
    getJiraActivity(date).catch(() => emptyJira),
    getConfluenceActivity(date).catch(() => emptyConfluence),
    getCalendarActivity(date).catch(() => emptyCalendar),
  ]);

  const activity = { calendar, confluence, github, jira };
  const existingReport = readExistingReport(date);

  // Skip dates with no activity at all and no handwritten report
  if (isEmptyActivity(activity) && !existingReport) {
    console.log('no activity, skip');
    skipped++;
    continue;
  }

  process.stdout.write('merge ... ');

  const prompt = buildMergePrompt(date, existingReport, activity);
  const content = await mergeWithClaude(prompt);

  saveReport(date, content);
  writeReport(date, content);

  console.log('done');
  generated++;

  // Small delay to avoid hammering Bedrock
  await new Promise((r) => setTimeout(r, 500));
}

console.log(`\nDone. Generated: ${generated}, Skipped (no data): ${skipped}, Already existed: ${alreadyExists}`);
