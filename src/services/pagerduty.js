import { getCached, setCached } from '../db/cache.js';

/**
 * @typedef {Object} PagerDutyIncident
 * @property {string} id
 * @property {string} title
 * @property {string} status - 'triggered' | 'acknowledged' | 'resolved'
 * @property {string} urgency - 'high' | 'low'
 * @property {string} url
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} [resolvedAt] - ISO 8601 timestamp, present when status is 'resolved'
 * @property {string} serviceName
 */

/**
 * @typedef {Object} PagerDutyActivity
 * @property {PagerDutyIncident[]} acknowledgedIncidents
 * @property {PagerDutyIncident[]} resolvedIncidents
 * @property {PagerDutyIncident[]} triggeredIncidents
 */

/**
 * Executes a PagerDuty REST API request and returns the parsed JSON response.
 *
 * @param {string} path - The API path (e.g. '/incidents').
 * @param {Record<string, string | string[]>} [params] - Query string parameters.
 * @returns {Promise<unknown>}
 */
async function pdFetch(path, params = {}) {
  const token = process.env.PAGERDUTY_TOKEN || '';
  const url = new URL(`https://api.pagerduty.com${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, v));
    } else {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      Authorization: `Token token=${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`PagerDuty API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Resolves the PagerDuty user ID for the configured email address.
 *
 * Results are not cached at the DB level since the user ID is stable; the
 * in-process call is only made once per process start in practice.
 *
 * @returns {Promise<string>} The PagerDuty user ID.
 */
async function resolveUserId() {
  const email = process.env.PAGERDUTY_USER_EMAIL || '';
  if (!email) throw new Error('PAGERDUTY_USER_EMAIL is not configured');

  const data = /** @type {{ users?: Array<{ id: string }> }} */ (
    await pdFetch('/users', { query: email })
  );
  const user = data.users?.[0];
  if (!user) throw new Error(`No PagerDuty user found for email: ${email}`);
  return user.id;
}

/**
 * Maps a raw PagerDuty incident API object to a PagerDutyIncident.
 *
 * @param {Record<string, unknown>} raw
 * @returns {PagerDutyIncident}
 */
function mapIncident(raw) {
  const service = /** @type {Record<string, unknown>} */ (raw.service ?? {});
  return {
    createdAt: String(raw.created_at ?? ''),
    id: String(raw.id ?? ''),
    resolvedAt: raw.resolved_at ? String(raw.resolved_at) : undefined,
    serviceName: String(service.summary ?? ''),
    status: String(raw.status ?? ''),
    title: String(raw.title ?? raw.summary ?? ''),
    urgency: String(raw.urgency ?? ''),
    url: String(raw.html_url ?? ''),
  };
}

/**
 * Fetches all pages of a paginated PagerDuty resource.
 *
 * @param {string} path - API path (e.g. '/incidents').
 * @param {Record<string, string | string[]>} params - Base query parameters.
 * @param {string} key - Top-level response key containing the array (e.g. 'incidents').
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function fetchAllPages(path, params, key) {
  const items = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = /** @type {Record<string, unknown> & { more?: boolean }} */ (
      await pdFetch(path, { ...params, limit: String(limit), offset: String(offset) })
    );
    const page = /** @type {Array<Record<string, unknown>>} */ (data[key] ?? []);
    items.push(...page);
    if (!data.more) break;
    offset += limit;
  }

  return items;
}

/**
 * Returns true if the user was on call (primary or secondary) at any point
 * during the given date window.
 *
 * Queries the /oncalls endpoint for schedule entries overlapping the day for
 * the given user. Escalation levels 1 (primary) and 2 (secondary) are both
 * considered on-call shifts.
 *
 * @param {string} userId
 * @param {string} since - ISO 8601 start of window.
 * @param {string} until - ISO 8601 end of window.
 * @returns {Promise<boolean>}
 */
/**
 * Returns the raw on-call entries from PagerDuty for the given date.
 *
 * Bypasses the cache. Intended for debugging to inspect escalation levels and
 * schedule entries without side effects.
 *
 * @param {string} date - Date in YYYY-MM-DD format.
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function getRawOnCalls(date) {
  const userId = await resolveUserId();
  const since = `${date}T00:00:00Z`;
  const nextDay = new Date(`${date}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const until = nextDay.toISOString();

  const data = /** @type {{ oncalls?: Array<Record<string, unknown>> }} */ (
    await pdFetch('/oncalls', { since, until, 'user_ids[]': [userId] })
  );
  return data.oncalls ?? [];
}

/**
 * Returns the on-call entries for the given user during the window, filtered
 * to primary (level 1) and secondary (level 2) shifts.
 *
 * @param {string} userId
 * @param {string} since - ISO 8601 start of window.
 * @param {string} until - ISO 8601 end of window.
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function getOnCallEntries(userId, since, until) {
  const data = /** @type {{ oncalls?: Array<Record<string, unknown>> }} */ (
    await pdFetch('/oncalls', {
      since,
      until,
      'user_ids[]': [userId],
    })
  );
  return (data.oncalls ?? []).filter((entry) => {
    const level = Number(entry.escalation_level);
    return level === 1 || level === 2;
  });
}

/**
 * Fetches PagerDuty incident activity for a given date, using the SQLite cache
 * when available.
 *
 * Only returns incidents if the configured user was on call (primary or secondary
 * escalation level) during any part of the given date. Returns an empty activity
 * object when the user was not on call.
 *
 * Requires the following environment variables:
 *   - PAGERDUTY_TOKEN — API User Key
 *   - PAGERDUTY_USER_EMAIL — email address of the user to fetch activity for
 *
 * @param {string} date - Date in YYYY-MM-DD format.
 * @returns {Promise<PagerDutyActivity>}
 */
export async function getPagerDutyActivity(date) {
  const cached = getCached('pagerduty', date);
  if (cached) return /** @type {PagerDutyActivity} */ (cached);

  const userId = await resolveUserId();

  const since = `${date}T00:00:00Z`;
  const nextDay = new Date(`${date}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const until = nextDay.toISOString();

  /** @type {PagerDutyActivity} */
  const empty = { acknowledgedIncidents: [], resolvedIncidents: [], triggeredIncidents: [] };

  const onCallEntries = await getOnCallEntries(userId, since, until);
  if (onCallEntries.length === 0) {
    return empty;
  }

  // Extract unique escalation policy IDs from the on-call entries so we fetch
  // all incidents that fired against the team queues the user was on call for,
  // not just incidents directly assigned to the user.
  const policyIds = [
    ...new Set(
      onCallEntries
        .map((e) => /** @type {Record<string, unknown>} */ (e.escalation_policy)?.id)
        .filter(/** @type {(id: unknown) => id is string} */ (id) => typeof id === 'string')
    ),
  ];

  const raw = await fetchAllPages(
    '/incidents',
    {
      'escalation_policy_ids[]': policyIds,
      since,
      'statuses[]': ['triggered', 'acknowledged', 'resolved'],
      until,
    },
    'incidents'
  );

  const all = raw.map(mapIncident);

  /** @type {PagerDutyActivity} */
  const activity = {
    acknowledgedIncidents: all.filter((i) => i.status === 'acknowledged'),
    resolvedIncidents: all.filter((i) => i.status === 'resolved'),
    triggeredIncidents: all.filter((i) => i.status === 'triggered'),
  };

  setCached('pagerduty', date, activity);
  return activity;
}
