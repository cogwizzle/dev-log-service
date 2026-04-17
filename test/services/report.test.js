import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/calendar.js');
vi.mock('../../src/services/github.js');
vi.mock('../../src/services/jira.js');
vi.mock('../../src/services/confluence.js');
vi.mock('../../src/services/summary.js');
vi.mock('../../src/db/cache.js');
vi.mock('fs');

import { getCalendarActivity } from '../../src/services/calendar.js';
import { getGithubActivity } from '../../src/services/github.js';
import { getJiraActivity } from '../../src/services/jira.js';
import { getConfluenceActivity } from '../../src/services/confluence.js';
import { generateSummary } from '../../src/services/summary.js';
import { getNotesAsText, getReport, saveReport } from '../../src/db/cache.js';
import fs from 'fs';
import {
  backfillReports,
  businessDaysInRange,
  generateReport,
  previousBusinessDay,
} from '../../src/services/report.js';

beforeEach(() => {
  vi.clearAllMocks();
  getNotesAsText.mockReturnValue('');
  getReport.mockReturnValue(null);
  fs.mkdirSync = vi.fn();
  fs.writeFileSync = vi.fn();
});

const emptyCalendar = { meetingCount: 0, meetings: [], totalHours: 0 };
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

describe('businessDaysInRange', () => {
  it('returns only weekdays', () => {
    // 2026-04-13 (Mon) to 2026-04-17 (Fri)
    const result = businessDaysInRange('2026-04-13', '2026-04-17');
    expect(result).toEqual(['2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17']);
  });

  it('skips Saturday and Sunday', () => {
    // 2026-04-10 (Fri) to 2026-04-13 (Mon)
    const result = businessDaysInRange('2026-04-10', '2026-04-13');
    expect(result).toEqual(['2026-04-10', '2026-04-13']);
  });

  it('returns a single day when from equals to', () => {
    expect(businessDaysInRange('2026-04-13', '2026-04-13')).toEqual(['2026-04-13']);
  });

  it('returns empty array when from is after to', () => {
    expect(businessDaysInRange('2026-04-17', '2026-04-13')).toEqual([]);
  });

  it('returns empty array for a weekend-only range', () => {
    // 2026-04-11 (Sat) to 2026-04-12 (Sun)
    expect(businessDaysInRange('2026-04-11', '2026-04-12')).toEqual([]);
  });
});

describe('backfillReports', () => {
  it('skips dates that already have a report', async () => {
    getReport.mockReturnValue({ content: '# Existing', date: '2026-04-14' });
    const progress = [];

    const totals = await backfillReports('2026-04-14', '2026-04-14', {
      onProgress: (p) => progress.push(p),
    });

    expect(totals).toEqual({ errors: 0, generated: 0, skipped: 1 });
    expect(progress).toEqual([{ date: '2026-04-14', reason: 'already exists', status: 'skipped' }]);
    expect(getGithubActivity).not.toHaveBeenCalled();
  });

  it('generates a report for dates without existing reports', async () => {
    getReport.mockReturnValue(null);
    getCalendarActivity.mockResolvedValue(emptyCalendar);
    getGithubActivity.mockReturnValue(emptyGithub);
    getJiraActivity.mockResolvedValue(emptyJira);
    getConfluenceActivity.mockResolvedValue(emptyConfluence);
    generateSummary.mockResolvedValue('# New');
    const progress = [];

    const totals = await backfillReports('2026-04-14', '2026-04-14', {
      onProgress: (p) => progress.push(p),
    });

    expect(totals).toEqual({ errors: 0, generated: 1, skipped: 0 });
    expect(progress).toEqual([{ date: '2026-04-14', status: 'generated' }]);
  });

  it('records errors for failed dates and continues', async () => {
    getReport.mockReturnValue(null);
    getGithubActivity.mockReturnValue(emptyGithub);
    getCalendarActivity.mockResolvedValue(emptyCalendar);
    getJiraActivity.mockResolvedValue(emptyJira);
    getConfluenceActivity.mockResolvedValue(emptyConfluence);
    generateSummary.mockRejectedValue(new Error('Bedrock down'));
    const progress = [];

    const totals = await backfillReports('2026-04-14', '2026-04-14', {
      onProgress: (p) => progress.push(p),
    });

    expect(totals).toEqual({ errors: 1, generated: 0, skipped: 0 });
    expect(progress[0].status).toBe('error');
    expect(progress[0].reason).toContain('Bedrock down');
  });

  it('force-regenerates existing reports when force is true', async () => {
    getReport.mockReturnValue({ content: '# Old', date: '2026-04-14' });
    getCalendarActivity.mockResolvedValue(emptyCalendar);
    getGithubActivity.mockReturnValue(emptyGithub);
    getJiraActivity.mockResolvedValue(emptyJira);
    getConfluenceActivity.mockResolvedValue(emptyConfluence);
    generateSummary.mockResolvedValue('# Refreshed');

    const totals = await backfillReports('2026-04-14', '2026-04-14', { force: true });
    expect(totals).toEqual({ errors: 0, generated: 1, skipped: 0 });
  });

  it('skips weekend dates', async () => {
    const progress = [];
    // 2026-04-11 (Sat) to 2026-04-12 (Sun)
    const totals = await backfillReports('2026-04-11', '2026-04-12', {
      onProgress: (p) => progress.push(p),
    });

    expect(totals).toEqual({ errors: 0, generated: 0, skipped: 0 });
    expect(progress).toHaveLength(0);
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
    getCalendarActivity.mockResolvedValue(emptyCalendar);
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
    getCalendarActivity.mockResolvedValue(emptyCalendar);
    getGithubActivity.mockReturnValue(emptyGithub);
    getJiraActivity.mockResolvedValue(emptyJira);
    getConfluenceActivity.mockResolvedValue(emptyConfluence);
    generateSummary.mockResolvedValue('# Fresh Report');

    const result = await generateReport('2026-01-01', { force: true });
    expect(result.content).toBe('# Fresh Report');
  });
});
