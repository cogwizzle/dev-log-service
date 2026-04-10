import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db/cache.js');

import { getCached, setCached } from '../../src/db/cache.js';
import { getConfluenceActivity } from '../../src/services/confluence.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  getCached.mockReturnValue(null);
  process.env.JIRA_EMAIL = 'user@example.com';
  process.env.JIRA_API_TOKEN = 'token123';
  process.env.CONFLUENCE_URL = 'https://confluence.example.com';
});

/** @param {object[]} results */
function mockConfluenceResponse(results) {
  return {
    json: vi.fn().mockResolvedValue({ results }),
    ok: true,
  };
}

describe('getConfluenceActivity', () => {
  it('returns cached data without fetching', async () => {
    const cached = { comments: [], createdPages: [], updatedPages: [] };
    getCached.mockReturnValue(cached);

    const result = await getConfluenceActivity('2026-01-01');
    expect(result).toBe(cached);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('maps created pages correctly', async () => {
    const page = {
      _links: { webui: '/spaces/ENG/pages/123' },
      ancestors: [],
      id: '123',
      space: { key: 'ENG' },
      title: 'My New Page',
      version: { when: '2026-01-01T10:00:00Z' },
    };

    mockFetch.mockResolvedValue(mockConfluenceResponse([page]));

    const result = await getConfluenceActivity('2026-01-01');
    expect(result.createdPages).toHaveLength(1);
    expect(result.createdPages[0]).toMatchObject({
      id: '123',
      spaceKey: 'ENG',
      title: 'My New Page',
      url: 'https://confluence.example.com/wiki/spaces/ENG/pages/123',
    });
    expect(setCached).toHaveBeenCalledWith('confluence', '2026-01-01', result);
  });

  it('throws when the API returns an error status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: vi.fn().mockResolvedValue('Forbidden'),
    });

    await expect(getConfluenceActivity('2026-01-01')).rejects.toThrow('Confluence API error 403');
  });
});
