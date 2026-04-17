import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';

/**
 * @typedef {import('./github.js').GithubActivity} GithubActivity
 * @typedef {import('./jira.js').JiraActivity} JiraActivity
 * @typedef {import('./confluence.js').ConfluenceActivity} ConfluenceActivity
 * @typedef {import('./calendar.js').CalendarActivity} CalendarActivity
 * @typedef {import('./pagerduty.js').PagerDutyActivity} PagerDutyActivity
 */

/**
 * @typedef {Object} ActivityBundle
 * @property {CalendarActivity} calendar
 * @property {ConfluenceActivity} confluence
 * @property {GithubActivity} github
 * @property {JiraActivity} jira
 * @property {string} [notes] - Freeform work notes for the day.
 * @property {PagerDutyActivity} [pagerduty]
 */

const client = new AnthropicBedrock();

/**
 * Builds the prompt text describing all activity for the given date.
 *
 * @param {string} date
 * @param {ActivityBundle} activity
 * @returns {string}
 */
function buildPrompt(date, activity) {
  const { calendar, confluence, github, jira, notes, pagerduty } = activity;

  const lines = [`Generate a developer activity report in Markdown for ${date}.`];
  lines.push('');
  lines.push(
    'Use the format of these example reports, which use Markdown reference-style links at the bottom:'
  );
  lines.push('');
  lines.push('```markdown');
  lines.push(`# What I did ${date}`);
  lines.push('');
  lines.push('## PRs authored');
  lines.push('');
  lines.push('- [PR title][RefLabel]');
  lines.push('');
  lines.push('[RefLabel]: https://url');
  lines.push('```');
  lines.push('');
  lines.push('Rules:');
  lines.push('- Use reference-style Markdown links collected at the bottom of the document.');
  lines.push('- Only include sections that have data.');
  lines.push('- Section names should be natural and human-readable, not just field names.');
  lines.push('- Write a concise narrative summary at the top before the sections.');
  lines.push('');
  if (notes && notes.trim()) {
    lines.push('## Additional Work Notes');
    lines.push('');
    lines.push(
      'The following notes were recorded manually and may include work not captured by the tools above. Incorporate them into the report.'
    );
    lines.push('');
    lines.push(notes.trim());
    lines.push('');
  }

  lines.push('## Raw Activity Data');
  lines.push('');

  lines.push('### Calendar');
  if (calendar.meetingCount > 0) {
    lines.push(
      `**Meetings (${calendar.meetingCount}, ${calendar.totalHours}h total in work hours):**`
    );
    calendar.meetings.forEach((m) => {
      const start = m.start instanceof Date ? m.start : new Date(/** @type {string} */ (m.start));
      const end = m.end instanceof Date ? m.end : new Date(/** @type {string} */ (m.end));
      const tz = process.env.TIMEZONE || 'America/New_York';
      const timeStr = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz })}–${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz })}`;
      lines.push(`- ${m.title} (${timeStr})`);
    });
  } else {
    lines.push('No meetings recorded for this date.');
  }
  lines.push('');

  lines.push('### GitHub');
  if (github.authoredPRs.length) {
    lines.push(`**Authored PRs (${github.authoredPRs.length}):**`);
    github.authoredPRs.forEach((pr) => lines.push(`- [${pr.title}](${pr.url}) [${pr.state}]`));
  }
  if (github.reviewedPRs.length) {
    lines.push(`**Reviewed PRs (${github.reviewedPRs.length}):**`);
    github.reviewedPRs.forEach((pr) => lines.push(`- [${pr.title}](${pr.url}) [${pr.state}]`));
  }
  if (github.commentedPRs.length) {
    lines.push(`**Commented PRs (${github.commentedPRs.length}):**`);
    github.commentedPRs.forEach((pr) => lines.push(`- [${pr.title}](${pr.url}) [${pr.state}]`));
  }
  if (github.commits.length) {
    lines.push(`**Commits (${github.commits.length}):**`);
    github.commits.forEach((c) => lines.push(`- ${c.repository}: ${c.message.split('\n')[0]}`));
  }

  lines.push('');
  lines.push('### JIRA');
  if (jira.createdIssues.length) {
    lines.push(`**Created Issues (${jira.createdIssues.length}):**`);
    jira.createdIssues.forEach((i) =>
      lines.push(`- [${i.key}](${i.url}): ${i.summary} [${i.status}]`)
    );
  }
  if (jira.updatedIssues.length) {
    lines.push(`**Updated Issues (${jira.updatedIssues.length}):**`);
    jira.updatedIssues.forEach((i) =>
      lines.push(`- [${i.key}](${i.url}): ${i.summary} [${i.status}]`)
    );
  }
  if (jira.commentedIssues.length) {
    lines.push(`**Commented Issues (${jira.commentedIssues.length}):**`);
    jira.commentedIssues.forEach((i) =>
      lines.push(`- [${i.key}](${i.url}): ${i.summary} [${i.status}]`)
    );
  }

  lines.push('');
  lines.push('### Confluence');
  if (confluence.createdPages.length) {
    lines.push(`**Created Pages (${confluence.createdPages.length}):**`);
    confluence.createdPages.forEach((p) => lines.push(`- [${p.title}](${p.url}) [${p.spaceKey}]`));
  }
  if (confluence.updatedPages.length) {
    lines.push(`**Updated Pages (${confluence.updatedPages.length}):**`);
    confluence.updatedPages.forEach((p) => lines.push(`- [${p.title}](${p.url}) [${p.spaceKey}]`));
  }
  if (confluence.comments.length) {
    lines.push(`**Comments (${confluence.comments.length}):**`);
    confluence.comments.forEach((c) => lines.push(`- Comment on [${c.pageTitle}](${c.pageUrl})`));
  }

  if (pagerduty) {
    const total =
      pagerduty.acknowledgedIncidents.length +
      pagerduty.resolvedIncidents.length +
      pagerduty.triggeredIncidents.length;
    lines.push('');
    lines.push('### PagerDuty');
    if (total === 0) {
      lines.push('No PagerDuty incidents for this date.');
    } else {
      if (pagerduty.triggeredIncidents.length) {
        lines.push(`**Triggered (${pagerduty.triggeredIncidents.length}):**`);
        pagerduty.triggeredIncidents.forEach((i) =>
          lines.push(`- [${i.title}](${i.url}) [${i.serviceName}] [${i.urgency} urgency]`)
        );
      }
      if (pagerduty.acknowledgedIncidents.length) {
        lines.push(`**Acknowledged (${pagerduty.acknowledgedIncidents.length}):**`);
        pagerduty.acknowledgedIncidents.forEach((i) =>
          lines.push(`- [${i.title}](${i.url}) [${i.serviceName}] [${i.urgency} urgency]`)
        );
      }
      if (pagerduty.resolvedIncidents.length) {
        lines.push(`**Resolved (${pagerduty.resolvedIncidents.length}):**`);
        pagerduty.resolvedIncidents.forEach((i) =>
          lines.push(`- [${i.title}](${i.url}) [${i.serviceName}] [${i.urgency} urgency]`)
        );
      }
    }
  }

  return lines.join('\n');
}

/**
 * Generates a Markdown activity report for the given date using Claude.
 *
 * Calls the Anthropic API with all activity data and returns the model's
 * formatted Markdown report.
 *
 * @param {string} date - Date in YYYY-MM-DD format.
 * @param {ActivityBundle} activity - Collected activity from all sources.
 * @returns {Promise<string>} The generated Markdown report content.
 */
export async function generateSummary(date, activity) {
  const prompt = buildPrompt(date, activity);

  const message = await client.messages.create({
    max_tokens: 2048,
    messages: [{ content: prompt, role: 'user' }],
    model: process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  });

  const block = message.content.find((b) => b.type === 'text');
  return block?.type === 'text' ? block.text : '';
}
