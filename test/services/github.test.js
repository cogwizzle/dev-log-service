import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process');
vi.mock('../../src/db/cache.js');

import { execSync } from 'child_process';
import { getCached, setCached } from '../../src/db/cache.js';
import { getGithubActivity } from '../../src/services/github.js';

beforeEach(() => {
  vi.clearAllMocks();
  getCached.mockReturnValue(null);
  process.env.GITHUB_ORGS = 'segmentio,twilio';
});

describe('getGithubActivity', () => {
  it('returns cached data without calling gh CLI', () => {
    const cached = { authoredPRs: [], commentedPRs: [], commits: [], reviewedPRs: [] };
    getCached.mockReturnValue(cached);

    const result = getGithubActivity('2026-01-01');
    expect(result).toBe(cached);
    expect(execSync).not.toHaveBeenCalled();
  });

  it('filters PRs by allowed org and caches result', () => {
    const authoredPR = {
      repository: { name: 'control-plane', nameWithOwner: 'segmentio/control-plane' },
      state: 'OPEN',
      title: 'feat: my PR',
      url: 'https://github.com/segmentio/control-plane/pull/1',
    };
    const outsidePR = {
      repository: { name: 'other-repo', nameWithOwner: 'external/other-repo' },
      state: 'OPEN',
      title: 'Outside PR',
      url: 'https://github.com/external/other-repo/pull/1',
    };

    execSync
      .mockReturnValueOnce(JSON.stringify([authoredPR, outsidePR]))
      .mockReturnValueOnce(JSON.stringify([]))
      .mockReturnValueOnce(JSON.stringify([]));

    const result = getGithubActivity('2026-01-01');
    expect(result.authoredPRs).toHaveLength(1);
    expect(result.authoredPRs[0].title).toBe('feat: my PR');
    expect(setCached).toHaveBeenCalledWith('github', '2026-01-01', result);
  });

  it('separates involved PRs into reviewed and commented', () => {
    const approvedPR = {
      repository: { nameWithOwner: 'twilio/some-repo' },
      state: 'APPROVED',
      title: 'Approved PR',
      url: 'https://github.com/twilio/some-repo/pull/2',
    };
    const commentedPR = {
      repository: { nameWithOwner: 'segmentio/app' },
      state: 'OPEN',
      title: 'Commented PR',
      url: 'https://github.com/segmentio/app/pull/3',
    };

    execSync
      .mockReturnValueOnce('[]')
      .mockReturnValueOnce(JSON.stringify([approvedPR, commentedPR]))
      .mockReturnValueOnce('[]');

    const result = getGithubActivity('2026-01-01');
    expect(result.reviewedPRs).toHaveLength(1);
    expect(result.commentedPRs).toHaveLength(1);
  });

  it('returns empty activity when gh CLI returns empty strings', () => {
    execSync.mockReturnValue('');
    const result = getGithubActivity('2026-01-01');
    expect(result.authoredPRs).toHaveLength(0);
    expect(result.commits).toHaveLength(0);
  });
});
