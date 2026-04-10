import { execSync } from 'child_process';
import { getCached, setCached } from '../db/cache.js';

/**
 * @typedef {Object} GithubPR
 * @property {string} title
 * @property {string} url
 * @property {string} state
 * @property {{ name: string, nameWithOwner: string }} repository
 */

/**
 * @typedef {Object} GithubCommit
 * @property {string} message
 * @property {string} repository
 * @property {string} sha
 */

/**
 * @typedef {Object} GithubActivity
 * @property {GithubPR[]} authoredPRs
 * @property {GithubPR[]} commentedPRs
 * @property {GithubCommit[]} commits
 * @property {GithubPR[]} reviewedPRs
 */

/**
 * Returns the list of allowed GitHub organizations from the GITHUB_ORGS env var.
 *
 * @returns {string[]} Lowercase organization names.
 */
function getAllowedOrgs() {
  const orgs = process.env.GITHUB_ORGS || '';
  return orgs
    .split(',')
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Filters a list of GitHub items to only those belonging to allowed organizations.
 *
 * @param {Array<{ repository?: { nameWithOwner?: string } }>} items
 * @returns {Array<{ repository?: { nameWithOwner?: string } }>}
 */
function filterAllowedOrgs(items) {
  const allowedOrgs = getAllowedOrgs();
  if (allowedOrgs.length === 0) return items;
  return items.filter((item) => {
    const owner = item.repository?.nameWithOwner?.split('/')[0]?.toLowerCase();
    return allowedOrgs.includes(owner);
  });
}

/**
 * Executes a shell command and returns stdout as a string, or empty string on error.
 *
 * @param {string} command
 * @returns {string}
 */
function run(command) {
  try {
    return execSync(command, { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

/**
 * Fetches GitHub activity for a given date, using the SQLite cache when available.
 *
 * Activity includes authored PRs, commented PRs, reviewed PRs, and commits scoped
 * to the organizations listed in the GITHUB_ORGS environment variable.
 *
 * @param {string} date - Date in YYYY-MM-DD format.
 * @returns {GithubActivity}
 */
export function getGithubActivity(date) {
  const cached = getCached('github', date);
  if (cached) return /** @type {GithubActivity} */ (cached);

  /** @type {GithubActivity} */
  const activity = { authoredPRs: [], commentedPRs: [], commits: [], reviewedPRs: [] };

  const authoredRaw = JSON.parse(
    run(`gh search prs --author @me --created ${date} --json url,title,state,repository`) || '[]'
  );
  activity.authoredPRs = /** @type {GithubPR[]} */ (filterAllowedOrgs(authoredRaw));

  const involvedRaw = JSON.parse(
    run(`gh search prs --involves @me --updated ${date} --json url,title,state,repository`) || '[]'
  );
  const filteredInvolved = /** @type {GithubPR[]} */ (filterAllowedOrgs(involvedRaw));
  activity.reviewedPRs = filteredInvolved.filter(
    (pr) => pr.state === 'APPROVED' || pr.state === 'CHANGES_REQUESTED'
  );
  activity.commentedPRs = filteredInvolved.filter(
    (pr) => pr.state !== 'APPROVED' && pr.state !== 'CHANGES_REQUESTED'
  );

  const commitsRaw = JSON.parse(
    run(`gh search commits --author @me --author-date ${date} --json sha,commit,repository`) || '[]'
  );
  const mappedCommits = commitsRaw.map((c) => ({
    message: c.commit.message,
    repository: c.repository.nameWithOwner,
    sha: c.sha,
  }));
  activity.commits = /** @type {GithubCommit[]} */ (
    filterAllowedOrgs(
      mappedCommits.map((c) => ({ ...c, repository: { nameWithOwner: c.repository } }))
    ).map((c) => {
      const item =
        /** @type {{ message: string, repository: { nameWithOwner: string }, sha: string }} */ (c);
      return { message: item.message, repository: item.repository.nameWithOwner, sha: item.sha };
    })
  );

  setCached('github', date, activity);
  return activity;
}
