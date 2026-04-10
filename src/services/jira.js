import { getCached, setCached } from '../db/cache.js';

/**
 * @typedef {Object} JiraIssue
 * @property {string} key
 * @property {string} summary
 * @property {string} status
 * @property {string} type
 * @property {string} url
 */

/**
 * @typedef {Object} JiraActivity
 * @property {JiraIssue[]} createdIssues
 * @property {JiraIssue[]} commentedIssues
 * @property {JiraIssue[]} updatedIssues
 */

/**
 * Returns the Basic Auth header value for Jira API requests.
 *
 * @returns {string}
 */
function authHeader() {
  const email = process.env.JIRA_EMAIL || '';
  const token = process.env.JIRA_API_TOKEN || '';
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

/**
 * Executes a Jira REST API request and returns the parsed JSON response.
 *
 * @param {string} path - The API path (e.g. '/rest/api/3/search').
 * @param {Record<string, string>} [params] - Query string parameters.
 * @returns {Promise<unknown>}
 */
async function jiraFetch(path, params = {}) {
  const base = process.env.JIRA_URL || '';
  const url = new URL(`${base}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      Authorization: authHeader(),
    },
  });

  if (!res.ok) {
    throw new Error(`Jira API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Searches Jira issues using JQL and returns up to maxResults issues.
 *
 * @param {string} jql
 * @param {number} [maxResults=100]
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function searchIssues(jql, maxResults = 100) {
  const data = /** @type {{ issues?: Array<Record<string, unknown>> }} */ (
    await jiraFetch('/rest/api/3/search/jql', {
      fields: 'summary,status,issuetype,comment,created,updated,assignee',
      jql,
      maxResults: String(maxResults),
    })
  );
  return data.issues ?? [];
}

/**
 * Maps a raw Jira issue API object to a JiraIssue.
 *
 * @param {Record<string, unknown>} issue
 * @returns {JiraIssue}
 */
function mapIssue(issue) {
  const fields = /** @type {Record<string, unknown>} */ (issue.fields ?? {});
  const status = /** @type {Record<string, unknown>} */ (fields.status ?? {});
  const issuetype = /** @type {Record<string, unknown>} */ (fields.issuetype ?? {});
  const base = process.env.JIRA_URL || '';
  return {
    key: String(issue.key ?? ''),
    status: String(status.name ?? ''),
    summary: String(fields.summary ?? ''),
    type: String(issuetype.name ?? ''),
    url: `${base}/browse/${issue.key}`,
  };
}

/**
 * Fetches Jira activity for a given date, using the SQLite cache when available.
 *
 * Returns issues created, updated, and commented on by the current user on the given date.
 *
 * @param {string} date - Date in YYYY-MM-DD format.
 * @returns {Promise<JiraActivity>}
 */
export async function getJiraActivity(date) {
  const cached = getCached('jira', date);
  if (cached) return /** @type {JiraActivity} */ (cached);

  const email = process.env.JIRA_EMAIL || '';
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  const next = nextDay.toISOString().split('T')[0];

  const [createdIssues, updatedIssues, commentedIssues] = await Promise.all([
    searchIssues(
      `reporter = "${email}" AND created >= "${date}" AND created < "${next}" ORDER BY created DESC`
    ),
    searchIssues(
      `assignee = "${email}" AND updated >= "${date}" AND updated < "${next}" AND created < "${date}" ORDER BY updated DESC`
    ),
    searchIssues(
      `issueFunction in commented("by ${email} after ${date}" ) AND issueFunction in commented("by ${email} before ${next}") ORDER BY updated DESC`
    ),
  ]);

  /** @type {JiraActivity} */
  const activity = {
    commentedIssues: commentedIssues.map(mapIssue),
    createdIssues: createdIssues.map(mapIssue),
    updatedIssues: updatedIssues.map(mapIssue),
  };

  setCached('jira', date, activity);
  return activity;
}
