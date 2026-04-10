import { getCached, setCached } from '../db/cache.js';

/**
 * @typedef {Object} ConfluencePage
 * @property {string} id
 * @property {string} title
 * @property {string} url
 * @property {string} spaceKey
 * @property {string} lastModified
 */

/**
 * @typedef {Object} ConfluenceComment
 * @property {string} id
 * @property {string} pageTitle
 * @property {string} pageUrl
 * @property {string} body
 * @property {string} created
 */

/**
 * @typedef {Object} ConfluenceActivity
 * @property {ConfluencePage[]} createdPages
 * @property {ConfluencePage[]} updatedPages
 * @property {ConfluenceComment[]} comments
 */

/**
 * Returns the Basic Auth header value for Confluence API requests.
 *
 * @returns {string}
 */
function authHeader() {
  const email = process.env.JIRA_EMAIL || '';
  const token = process.env.JIRA_API_TOKEN || '';
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

/**
 * Executes a Confluence REST API request and returns the parsed JSON response.
 *
 * @param {string} path - The API path (e.g. '/wiki/rest/api/content/search').
 * @param {Record<string, string>} [params] - Query string parameters.
 * @returns {Promise<unknown>}
 */
async function confluenceFetch(path, params = {}) {
  const base = process.env.CONFLUENCE_URL || '';
  const url = new URL(`${base}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      Authorization: authHeader(),
    },
  });

  if (!res.ok) {
    throw new Error(`Confluence API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Searches Confluence content using CQL.
 *
 * @param {string} cql
 * @param {number} [limit=50]
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function searchContent(cql, limit = 50) {
  const data = /** @type {{ results?: Array<Record<string, unknown>> }} */ (
    await confluenceFetch('/wiki/rest/api/content/search', {
      cql,
      expand: 'space,version,ancestors,body.storage',
      limit: String(limit),
    })
  );
  return data.results ?? [];
}

/**
 * Maps a raw Confluence content API object to a ConfluencePage.
 *
 * @param {Record<string, unknown>} page
 * @returns {ConfluencePage}
 */
function mapPage(page) {
  const space = /** @type {Record<string, unknown>} */ (page.space ?? {});
  const version = /** @type {Record<string, unknown>} */ (page.version ?? {});
  const links = /** @type {Record<string, unknown>} */ (page._links ?? {});
  const base = process.env.CONFLUENCE_URL || '';
  return {
    id: String(page.id ?? ''),
    lastModified: String(version.when ?? ''),
    spaceKey: String(space.key ?? ''),
    title: String(page.title ?? ''),
    url: `${base}/wiki${links.webui ?? ''}`,
  };
}

/**
 * Maps a raw Confluence comment API object to a ConfluenceComment.
 *
 * @param {Record<string, unknown>} comment
 * @returns {ConfluenceComment}
 */
function mapComment(comment) {
  const ancestors = /** @type {Array<Record<string, unknown>>} */ (comment.ancestors ?? []);
  const parent = ancestors[ancestors.length - 1] ?? {};
  const links = /** @type {Record<string, unknown>} */ (comment._links ?? {});
  const version = /** @type {Record<string, unknown>} */ (comment.version ?? {});
  const body = /** @type {Record<string, unknown>} */ (comment.body ?? {});
  const storage = /** @type {Record<string, unknown>} */ (body.storage ?? {});
  const base = process.env.CONFLUENCE_URL || '';
  return {
    body: String(storage.value ?? ''),
    created: String(version.when ?? ''),
    id: String(comment.id ?? ''),
    pageTitle: String(parent.title ?? ''),
    pageUrl: `${base}/wiki${links.webui ?? ''}`,
  };
}

/**
 * Fetches Confluence activity for a given date, using the SQLite cache when available.
 *
 * Returns pages created, pages updated, and comments written by the current user on the given date.
 *
 * @param {string} date - Date in YYYY-MM-DD format.
 * @returns {Promise<ConfluenceActivity>}
 */
export async function getConfluenceActivity(date) {
  const cached = getCached('confluence', date);
  if (cached) return /** @type {ConfluenceActivity} */ (cached);

  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  const next = nextDay.toISOString().split('T')[0];

  const [createdPages, updatedPages, comments] = await Promise.all([
    searchContent(
      `type = "page" AND creator = currentUser() AND created >= "${date}" AND created < "${next}"`
    ),
    searchContent(
      `type = "page" AND contributor = currentUser() AND lastModified >= "${date}" AND lastModified < "${next}" AND created < "${date}"`
    ),
    searchContent(
      `type = "comment" AND creator = currentUser() AND created >= "${date}" AND created < "${next}"`
    ),
  ]);

  /** @type {ConfluenceActivity} */
  const activity = {
    comments: comments.map(mapComment),
    createdPages: createdPages.map(mapPage),
    updatedPages: updatedPages.map(mapPage),
  };

  setCached('confluence', date, activity);
  return activity;
}
