import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/db/cache.js');

import { getCached, setCached } from '../../src/db/cache.js';
import { getCalendarActivity } from '../../src/services/calendar.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const SAMPLE_ICS = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Team standup
DTSTART:20260409T140000Z
DTEND:20260409T143000Z
END:VEVENT
BEGIN:VEVENT
SUMMARY:Late night event
DTSTART:20260409T010000Z
DTEND:20260409T020000Z
END:VEVENT
BEGIN:VEVENT
SUMMARY:Different day meeting
DTSTART:20260410T140000Z
DTEND:20260410T150000Z
END:VEVENT
END:VCALENDAR`;

beforeEach(() => {
  vi.clearAllMocks();
  getCached.mockReturnValue(null);
  process.env.CALENDAR_ICS_URL = 'https://example.com/calendar.ics';
});

afterEach(() => {
  delete process.env.CALENDAR_ICS_URL;
});

describe('getCalendarActivity', () => {
  it('returns empty activity when CALENDAR_ICS_URL is not set', async () => {
    delete process.env.CALENDAR_ICS_URL;
    const result = await getCalendarActivity('2026-04-09');
    expect(result).toEqual({ meetingCount: 0, meetings: [], totalHours: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns cached data without fetching', async () => {
    const cached = { meetingCount: 1, meetings: [], totalHours: 0.5 };
    getCached.mockReturnValue(cached);
    const result = await getCalendarActivity('2026-04-09');
    expect(result).toBe(cached);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches ICS and filters to work-hours meetings on the target date', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue(SAMPLE_ICS) });

    const result = await getCalendarActivity('2026-04-09');

    // Only "Team standup" falls on 2026-04-09 and in work hours (UTC 14:00 = local 9AM CST)
    expect(result.meetingCount).toBe(1);
    expect(result.meetings[0].title).toBe('Team standup');
    expect(result.totalHours).toBe(0.5);
    expect(setCached).toHaveBeenCalledWith(
      'calendar',
      '2026-04-09',
      expect.objectContaining({
        meetingCount: 1,
        totalHours: 0.5,
      })
    );
  });

  it('throws when the ICS fetch returns an error status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 });
    await expect(getCalendarActivity('2026-04-09')).rejects.toThrow(
      'Calendar ICS fetch failed: 403'
    );
  });

  it('returns empty activity when no meetings fall on the target date', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue(SAMPLE_ICS) });
    const result = await getCalendarActivity('2026-01-01');
    expect(result.meetingCount).toBe(0);
    expect(result.meetings).toHaveLength(0);
    expect(result.totalHours).toBe(0);
  });
});
