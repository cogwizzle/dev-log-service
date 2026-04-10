import { getCached, setCached } from '../db/cache.js';

/**
 * @typedef {Object} CalendarEvent
 * @property {string} title
 * @property {Date} start
 * @property {Date} end
 */

/**
 * @typedef {Object} CalendarActivity
 * @property {CalendarEvent[]} meetings - Work-hours meetings for the date.
 * @property {number} meetingCount
 * @property {number} totalHours
 */

/**
 * Fetches the raw ICS feed content from the given URL.
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchICS(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Calendar ICS fetch failed: ${res.status}`);
  }
  return res.text();
}

/**
 * Parses an ICS date string into a JavaScript Date.
 *
 * Handles both all-day events (YYYYMMDD) and timed events (YYYYMMDDTHHmmssZ).
 *
 * @param {string} icsDate
 * @returns {Date}
 */
function parseICSDate(icsDate) {
  const cleaned = icsDate.replace(/[:-]/g, '');
  const year = cleaned.substring(0, 4);
  const month = cleaned.substring(4, 6);
  const day = cleaned.substring(6, 8);

  if (cleaned.length === 8) {
    return new Date(`${year}-${month}-${day}`);
  }

  const hour = cleaned.substring(9, 11);
  const minute = cleaned.substring(11, 13);
  const second = cleaned.substring(13, 15);
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
}

/**
 * Parses raw ICS feed text into an array of calendar events.
 *
 * Only captures SUMMARY, DTSTART, and DTEND fields.
 *
 * @param {string} icsData
 * @returns {CalendarEvent[]}
 */
function parseICS(icsData) {
  /** @type {CalendarEvent[]} */
  const events = [];
  const lines = icsData.split('\n').map((l) => l.trim());

  /** @type {Partial<CalendarEvent> | null} */
  let current = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT' && current) {
      if (current.start && current.end && current.title) {
        events.push(/** @type {CalendarEvent} */ (current));
      }
      current = null;
    } else if (current && line.includes(':')) {
      const colon = line.indexOf(':');
      const key = line.substring(0, colon);
      const value = line.substring(colon + 1);

      if (key.startsWith('DTSTART')) {
        current.start = parseICSDate(value);
      } else if (key.startsWith('DTEND')) {
        current.end = parseICSDate(value);
      } else if (key === 'SUMMARY') {
        current.title = value;
      }
    }
  }

  return events;
}

/**
 * Returns true if the meeting starts during work hours in the configured timezone.
 *
 * Uses TIMEZONE env var (default: America/New_York) so that ICS timestamps
 * stored in UTC are converted to local time before the 9 AM – 5 PM check.
 *
 * @param {Date} start
 * @returns {boolean}
 */
function isWorkHours(start) {
  const tz = process.env.TIMEZONE || 'America/New_York';
  const hour = parseInt(
    start.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: tz }),
    10
  );
  return hour >= 9 && hour < 17;
}

/**
 * Fetches and filters Google Calendar events for a given date using the ICS
 * subscription URL configured in CALENDAR_ICS_URL. Results are cached for 1 hour.
 *
 * Only meetings that start during work hours (9 AM – 5 PM UTC) are included.
 * Returns empty activity (not an error) if no URL is configured.
 *
 * @param {string} date - Date in YYYY-MM-DD format.
 * @returns {Promise<CalendarActivity>}
 */
export async function getCalendarActivity(date) {
  const cached = getCached('calendar', date);
  if (cached) return /** @type {CalendarActivity} */ (cached);

  /** @type {CalendarActivity} */
  const empty = { meetingCount: 0, meetings: [], totalHours: 0 };

  const icsUrl = process.env.CALENDAR_ICS_URL;
  if (!icsUrl) return empty;

  const icsData = await fetchICS(icsUrl);
  const allEvents = parseICS(icsData);

  const tz = process.env.TIMEZONE || 'America/New_York';
  const meetings = allEvents.filter((e) => {
    const eventDate = e.start.toLocaleDateString('en-CA', { timeZone: tz }); // en-CA gives YYYY-MM-DD format
    return eventDate === date && isWorkHours(e.start);
  });

  let totalHours = 0;
  for (const m of meetings) {
    totalHours += (m.end.getTime() - m.start.getTime()) / (1000 * 60 * 60);
  }

  /** @type {CalendarActivity} */
  const activity = {
    meetingCount: meetings.length,
    meetings,
    totalHours: Math.round(totalHours * 10) / 10,
  };

  setCached('calendar', date, {
    meetingCount: activity.meetingCount,
    meetings: activity.meetings.map((m) => ({
      end: m.end.toISOString(),
      start: m.start.toISOString(),
      title: m.title,
    })),
    totalHours: activity.totalHours,
  });

  return activity;
}
