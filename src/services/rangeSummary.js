import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import { getReport } from '../db/cache.js';

const client = new AnthropicBedrock();

/**
 * Returns all YYYY-MM-DD dates between from and to inclusive.
 *
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 * @returns {string[]}
 */
function dateRange(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().split('T')[0]);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Builds the Claude prompt for synthesizing a range of daily reports.
 *
 * @param {string} title
 * @param {string} from
 * @param {string} to
 * @param {Array<{ date: string, content: string }>} reports
 * @returns {string}
 */
function buildPrompt(title, from, to, reports) {
  const lines = [];

  lines.push(`Generate a summary report titled "${title}" covering ${from} to ${to}.`);
  lines.push('');
  lines.push('Use this exact Markdown format:');
  lines.push('');
  lines.push('```markdown');
  lines.push(`# ${title}`);
  lines.push(`_${from} – ${to}_`);
  lines.push('');
  lines.push('## Launches / Deliverables');
  lines.push(
    '<Completed work shipped or delivered: PRs merged, tickets closed, features landed, docs published>'
  );
  lines.push('');
  lines.push('## Quality / Operational Impact');
  lines.push(
    '<Bug fixes, reliability improvements, performance work, on-call actions, process improvements, test coverage>'
  );
  lines.push('');
  lines.push('## Collaboration / Cross-Team Impact');
  lines.push(
    '<Code reviews, design discussions, RFC participation, mentoring, cross-team syncs, unblocking others>'
  );
  lines.push('');
  lines.push('## Learning / Growth');
  lines.push('<Investigations, spikes, new skills, knowledge sharing, documentation written>');
  lines.push('```');
  lines.push('');
  lines.push('Rules:');
  lines.push(
    '- Always include all four sections, even if light — note "None this period." if truly empty.'
  );
  lines.push('- Use reference-style Markdown links collected at the bottom.');
  lines.push('- Deduplicate: if the same PR or ticket appears on multiple days, mention it once.');
  lines.push('- Prioritise completed/shipped work over in-progress work.');
  lines.push('- Be concise and outcome-focused — this is a performance summary, not a transcript.');
  lines.push('');
  lines.push(`## Daily Reports (${reports.length} days)`);
  lines.push('');

  for (const { date, content } of reports) {
    lines.push(`### ${date}`);
    lines.push('');
    lines.push(content);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generates a Markdown summary report for a date range by reading all
 * previously generated daily reports and synthesizing them with Claude.
 *
 * Only dates that have a saved report in the database are included.
 * Throws if no reports are found in the given range.
 *
 * @param {string} title - User-provided name for the summary.
 * @param {string} from - Start date in YYYY-MM-DD format.
 * @param {string} to - End date in YYYY-MM-DD format.
 * @returns {Promise<string>} The generated Markdown content.
 */
export async function generateRangeSummary(title, from, to) {
  const dates = dateRange(from, to);
  const reports = dates
    .map((date) => {
      const row = getReport(date);
      return row ? { content: row.content, date } : null;
    })
    .filter(
      /** @type {(r: unknown) => r is { date: string, content: string }} */ (r) => r !== null
    );

  if (reports.length === 0) {
    throw new Error(`No saved reports found between ${from} and ${to}.`);
  }

  const prompt = buildPrompt(title, from, to, reports);

  const message = await client.messages.create({
    max_tokens: 4096,
    messages: [{ content: prompt, role: 'user' }],
    model: process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  });

  const block = message.content.find((b) => b.type === 'text');
  return block?.type === 'text' ? block.text : '';
}
