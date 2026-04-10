import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/github.js');
vi.mock('../../src/services/jira.js');
vi.mock('../../src/services/confluence.js');
vi.mock('../../src/services/summary.js');
vi.mock('../../src/db/cache.js');
vi.mock('fs');

import { getGithubActivity } from '../../src/services/github.js';
import { getJiraActivity } from '../../src/services/jira.js';
import { getConfluenceActivity } from '../../src/services/confluence.js';
import { generateSummary } from '../../src/services/summary.js';
import { getNotesAsText, getReport, saveReport } from '../../src/db/cache.js';
import fs from 'fs';
import { generateReport, previousBusinessDay } from '../../src/services/report.js';

beforeEach(() => {
  vi.clearAllMocks();
  getNotesAsText.mockReturnValue('');
  getReport.mockReturnValue(null);
  fs.mkdirSync = vi.fn();
  fs.writeFileSync = vi.fn();
});

const emptyGithub = { authoredPRs: [], commentedPRs: [], commits: [], reviewedPRs: [] };
const emptyJira = { commentedIssues: [], createdIssues: [], updatedIssues: [] };
const emptyConfluence = { comments: [], createdPages: [], updatedPages: [] };

describe('previousBusinessDay', () => {
  it('returns Friday for Monday', () => {
    // 2026-04-06 is a Monday
    const result = previousBusinessDay(new Date('2026-04-06T12:00:00'));
    expect(result).toBe('2026-04-03');
  });

  it('returns previous day for Tuesday–Friday', () => {
    expect(previousBusinessDay(new Date('2026-04-07T12:00:00'))).toBe('2026-04-06');
    expect(previousBusinessDay(new Date('2026-04-10T12:00:00'))).toBe('2026-04-09');
  });

  it('returns Friday for Sunday', () => {
    expect(previousBusinessDay(new Date('2026-04-05T12:00:00'))).toBe('2026-04-03');
  });
});

describe('generateReport', () => {
  it('returns cached report without re-fetching', async () => {
    getReport.mockReturnValue({ content: '# Cached', date: '2026-01-01' });

    const result = await generateReport('2026-01-01');
    expect(result.content).toBe('# Cached');
    expect(getGithubActivity).not.toHaveBeenCalled();
  });

  it('fetches all sources and generates summary', async () => {
    getGithubActivity.mockReturnValue(emptyGithub);
    getJiraActivity.mockResolvedValue(emptyJira);
    getConfluenceActivity.mockResolvedValue(emptyConfluence);
    generateSummary.mockResolvedValue('# Generated Report');

    const result = await generateReport('2026-01-01');
    expect(result.content).toBe('# Generated Report');
    expect(saveReport).toHaveBeenCalledWith('2026-01-01', '# Generated Report');
  });

  it('force-regenerates even when cached report exists', async () => {
    getReport.mockReturnValue({ content: '# Old', date: '2026-01-01' });
    getGithubActivity.mockReturnValue(emptyGithub);
    getJiraActivity.mockResolvedValue(emptyJira);
    getConfluenceActivity.mockResolvedValue(emptyConfluence);
    generateSummary.mockResolvedValue('# Fresh Report');

    const result = await generateReport('2026-01-01', { force: true });
    expect(result.content).toBe('# Fresh Report');
  });
});
