import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getCached, setCached, saveReport, getReport, listReports } from '../../src/db/cache.js';
import { getDb, closeDb } from '../../src/db/index.js';

beforeEach(() => {
  // Clear all tables between tests for a clean slate
  const db = getDb();
  db.exec('DELETE FROM activity_cache; DELETE FROM reports;');
});

afterAll(() => {
  closeDb();
});

describe('getCached / setCached', () => {
  it('returns null on cache miss', () => {
    expect(getCached('github', '2026-01-01')).toBeNull();
  });

  it('returns cached data after setCached', () => {
    const data = { authoredPRs: [], commits: [] };
    setCached('github', '2026-01-01', data);
    expect(getCached('github', '2026-01-01')).toEqual(data);
  });

  it('returns null when TTL has expired', () => {
    const data = { authoredPRs: [] };
    setCached('github', '2026-01-02', data);

    // Overwrite fetched_at to 2 hours ago so the TTL check fails
    const db = getDb();
    db
      .prepare(
        "UPDATE activity_cache SET fetched_at = ? WHERE source = 'github' AND date = '2026-01-02'"
      )
      .run(Date.now() - 2 * 60 * 60 * 1000);

    expect(getCached('github', '2026-01-02')).toBeNull();
  });

  it('overwrites existing cache entry', () => {
    setCached('jira', '2026-01-01', { createdIssues: [] });
    setCached('jira', '2026-01-01', { createdIssues: [{ key: 'LAB-1' }] });
    expect(getCached('jira', '2026-01-01')).toEqual({ createdIssues: [{ key: 'LAB-1' }] });
  });
});

describe('saveReport / getReport / listReports', () => {
  it('returns null for missing report', () => {
    expect(getReport('2026-01-01')).toBeNull();
  });

  it('saves and retrieves a report', () => {
    saveReport('2026-01-01', '# What I did');
    const report = getReport('2026-01-01');
    expect(report).not.toBeNull();
    expect(report.date).toBe('2026-01-01');
    expect(report.content).toBe('# What I did');
  });

  it('overwrites an existing report on upsert', () => {
    saveReport('2026-01-01', 'old');
    saveReport('2026-01-01', 'new');
    expect(getReport('2026-01-01').content).toBe('new');
  });

  it('lists reports ordered by date descending', () => {
    saveReport('2026-01-01', 'a');
    saveReport('2026-01-03', 'c');
    saveReport('2026-01-02', 'b');
    const reports = listReports();
    expect(reports.map((r) => r.date)).toEqual(['2026-01-03', '2026-01-02', '2026-01-01']);
  });
});
