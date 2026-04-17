import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db/cache.js');

import { getCached, setCached } from '../../src/db/cache.js';
import { getPagerDutyActivity } from '../../src/services/pagerduty.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  getCached.mockReturnValue(null);
  process.env.PAGERDUTY_TOKEN = 'test-token';
  process.env.PAGERDUTY_USER_EMAIL = 'user@example.com';
});

/** @param {object} user */
function mockUserResponse(user) {
  return { json: vi.fn().mockResolvedValue({ users: [user] }), ok: true };
}

/** @param {object[]} oncalls */
function mockOnCallResponse(oncalls) {
  return { json: vi.fn().mockResolvedValue({ oncalls }), ok: true };
}

/** @param {object[]} incidents */
function mockIncidentsResponse(incidents) {
  return { json: vi.fn().mockResolvedValue({ incidents, more: false }), ok: true };
}

const stubUser = { id: 'U123' };

const stubIncident = {
  created_at: '2026-01-02T10:00:00Z',
  html_url: 'https://twilio.pagerduty.com/incidents/P001',
  id: 'P001',
  resolved_at: '2026-01-02T11:00:00Z',
  service: { summary: 'Payments API' },
  status: 'resolved',
  title: 'High error rate',
  urgency: 'high',
};

/** @param {number} level */
function oncallEntry(level) {
  return {
    escalation_level: level,
    escalation_policy: { id: 'EP001', summary: 'My Team Policy' },
    end: '2026-01-03T00:00:00Z',
    start: '2026-01-02T00:00:00Z',
    user: { id: 'U123' },
  };
}

describe('getPagerDutyActivity', () => {
  it('returns cached data without fetching', async () => {
    const cached = {
      acknowledgedIncidents: [],
      resolvedIncidents: [],
      triggeredIncidents: [],
    };
    getCached.mockReturnValue(cached);

    const result = await getPagerDutyActivity('2026-01-02');
    expect(result).toBe(cached);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns empty activity without caching when user is not on call', async () => {
    mockFetch
      .mockResolvedValueOnce(mockUserResponse(stubUser))
      .mockResolvedValueOnce(mockOnCallResponse([]));

    const result = await getPagerDutyActivity('2026-01-02');

    expect(result).toEqual({
      acknowledgedIncidents: [],
      resolvedIncidents: [],
      triggeredIncidents: [],
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(setCached).not.toHaveBeenCalled();
  });

  it('fetches incidents by escalation policy when user is primary on call (level 1)', async () => {
    mockFetch
      .mockResolvedValueOnce(mockUserResponse(stubUser))
      .mockResolvedValueOnce(mockOnCallResponse([oncallEntry(1)]))
      .mockResolvedValueOnce(mockIncidentsResponse([stubIncident]));

    const result = await getPagerDutyActivity('2026-01-02');

    // Incidents call should use escalation_policy_ids[], not user_ids[]
    const incidentsUrl = mockFetch.mock.calls[2][0];
    expect(incidentsUrl).toContain('escalation_policy_ids');
    expect(incidentsUrl).not.toContain('user_ids');

    expect(result.resolvedIncidents).toHaveLength(1);
    expect(result.resolvedIncidents[0]).toMatchObject({
      id: 'P001',
      resolvedAt: '2026-01-02T11:00:00Z',
      serviceName: 'Payments API',
      status: 'resolved',
      title: 'High error rate',
      urgency: 'high',
      url: 'https://twilio.pagerduty.com/incidents/P001',
    });
    expect(setCached).toHaveBeenCalledWith('pagerduty', '2026-01-02', result);
  });

  it('fetches incidents when user is secondary on call (level 2)', async () => {
    mockFetch
      .mockResolvedValueOnce(mockUserResponse(stubUser))
      .mockResolvedValueOnce(mockOnCallResponse([oncallEntry(2)]))
      .mockResolvedValueOnce(mockIncidentsResponse([stubIncident]));

    const result = await getPagerDutyActivity('2026-01-02');

    expect(result.resolvedIncidents).toHaveLength(1);
  });

  it('does not fetch incidents for escalation levels above 2', async () => {
    mockFetch
      .mockResolvedValueOnce(mockUserResponse(stubUser))
      .mockResolvedValueOnce(mockOnCallResponse([oncallEntry(3)]));

    const result = await getPagerDutyActivity('2026-01-02');

    expect(result).toEqual({
      acknowledgedIncidents: [],
      resolvedIncidents: [],
      triggeredIncidents: [],
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('correctly partitions incidents by status', async () => {
    const triggered = { ...stubIncident, id: 'P1', resolved_at: null, status: 'triggered' };
    const acknowledged = { ...stubIncident, id: 'P2', resolved_at: null, status: 'acknowledged' };
    const resolved = { ...stubIncident, id: 'P3', status: 'resolved' };

    mockFetch
      .mockResolvedValueOnce(mockUserResponse(stubUser))
      .mockResolvedValueOnce(mockOnCallResponse([oncallEntry(1)]))
      .mockResolvedValueOnce(mockIncidentsResponse([triggered, acknowledged, resolved]));

    const result = await getPagerDutyActivity('2026-01-02');

    expect(result.triggeredIncidents).toHaveLength(1);
    expect(result.triggeredIncidents[0].id).toBe('P1');
    expect(result.acknowledgedIncidents).toHaveLength(1);
    expect(result.acknowledgedIncidents[0].id).toBe('P2');
    expect(result.resolvedIncidents).toHaveLength(1);
    expect(result.resolvedIncidents[0].id).toBe('P3');
  });

  it('throws when PAGERDUTY_USER_EMAIL is not set', async () => {
    delete process.env.PAGERDUTY_USER_EMAIL;
    await expect(getPagerDutyActivity('2026-01-02')).rejects.toThrow(
      'PAGERDUTY_USER_EMAIL is not configured'
    );
  });

  it('throws when no user is found for the email', async () => {
    mockFetch.mockResolvedValueOnce({ json: vi.fn().mockResolvedValue({ users: [] }), ok: true });
    await expect(getPagerDutyActivity('2026-01-02')).rejects.toThrow(
      'No PagerDuty user found for email'
    );
  });

  it('throws when the API returns an error status', async () => {
    mockFetch.mockResolvedValueOnce(mockUserResponse(stubUser)).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('Unauthorized'),
    });

    await expect(getPagerDutyActivity('2026-01-02')).rejects.toThrow('PagerDuty API error 401');
  });

  it('paginates through multiple pages of incidents', async () => {
    const page1 = [{ ...stubIncident, id: 'P1' }];
    const page2 = [{ ...stubIncident, id: 'P2' }];

    mockFetch
      .mockResolvedValueOnce(mockUserResponse(stubUser))
      .mockResolvedValueOnce(mockOnCallResponse([oncallEntry(1)]))
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ incidents: page1, more: true }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ incidents: page2, more: false }),
        ok: true,
      });

    const result = await getPagerDutyActivity('2026-01-02');
    expect(result.resolvedIncidents).toHaveLength(2);
  });
});
