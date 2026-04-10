import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db/cache.js');

import { getCached, setCached } from '../../src/db/cache.js';
import { getJiraActivity } from '../../src/services/jira.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  getCached.mockReturnValue(null);
  process.env.JIRA_EMAIL = 'user@example.com';
  process.env.JIRA_API_TOKEN = 'token123';
  process.env.JIRA_URL = 'https://jira.example.com';
});

/** @param {object[]} issues */
function mockJiraResponse(issues) {
  return {
    json: vi.fn().mockResolvedValue({ issues }),
    ok: true,
  };
}

describe('getJiraActivity', () => {
  it('returns cached data without fetching', async () => {
    const cached = { commentedIssues: [], createdIssues: [], updatedIssues: [] };
    getCached.mockReturnValue(cached);

    const result = await getJiraActivity('2026-01-01');
    expect(result).toBe(cached);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('maps created, updated, and commented issues', async () => {
    const issue = {
      fields: {
        assignee: { email: 'user@example.com' },
        issuetype: { name: 'Story' },
        status: { name: 'In Progress' },
        summary: 'Fix the bug',
      },
      key: 'LAB-100',
    };

    mockFetch.mockResolvedValue(mockJiraResponse([issue]));

    const result = await getJiraActivity('2026-01-01');
    expect(result.createdIssues).toHaveLength(1);
    expect(result.createdIssues[0]).toMatchObject({
      key: 'LAB-100',
      status: 'In Progress',
      summary: 'Fix the bug',
      type: 'Story',
      url: 'https://jira.example.com/browse/LAB-100',
    });
    expect(setCached).toHaveBeenCalledWith('jira', '2026-01-01', result);
  });

  it('throws when the API returns an error status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('Unauthorized'),
    });

    await expect(getJiraActivity('2026-01-01')).rejects.toThrow('Jira API error 401');
  });
});
