import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '../db';
import { mockConfig, url } from '../utils';
import { handlers } from './index';
import { mockAccessToken, resetAuthMock } from './identity';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => {
  resetDb();
  resetAuthMock();
  mockConfig.latencyMs = 0;
  mockConfig.enforceAuth = false;
});

interface WireResponse { status: number; body: Record<string, unknown> }
const request = async (path: string, method = 'GET', body?: unknown): Promise<WireResponse> => {
  const response = await fetch(url(path), {
    method,
    headers: {
      Authorization: `Bearer ${mockAccessToken('u-staff')}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
};
const payload = (response: WireResponse) => response.body.data as Record<string, unknown>;
const error = (response: WireResponse) => response.body.error as { code: string };

describe('Cashier Shift MSW handlers', () => {
  it('returns 404 current before any shift is opened', async () => {
    const response = await request('/cashier-shifts/current');
    expect(response.status).toBe(404);
    expect(error(response).code).toBe('NOT_FOUND');
    expect(db.cashierShifts).toEqual([]);
  });

  it('opens, persists across requests, rejects duplicate open with 409, closes and then reports no current shift', async () => {
    const opened = await request('/cashier-shifts/open', 'POST', { branch_id: 1, register_code: 'MAIN', opening_cash: 500000 });
    expect(opened.status).toBe(201);
    expect(opened.body).toMatchObject({ success: true, meta: null });
    expect(payload(opened)).toMatchObject({ id: 1, branch_id: 1, register_code: 'MAIN', opening_cash: 500000, status: 'Open' });
    expect(db.cashierShifts).toHaveLength(1);

    const current = await request('/cashier-shifts/current');
    expect(current.status).toBe(200);
    expect(payload(current)).toMatchObject({ id: 1, status: 'Open', opening_cash: 500000 });

    const duplicate = await request('/cashier-shifts/open', 'POST', { branch_id: 1, register_code: 'MAIN', opening_cash: 10 });
    expect(duplicate.status).toBe(409);
    expect(error(duplicate).code).toBe('CONFLICT');
    expect(db.cashierShifts).toHaveLength(1);

    const closed = await request('/cashier-shifts/1/close', 'POST', { closing_cash: 620000 });
    expect(closed.status).toBe(200);
    expect(payload(closed)).toMatchObject({ status: 'Closed', closing_cash: 620000, expected_cash: 500000, discrepancy: 120000 });
    expect(db.cashierShifts[0]).toMatchObject({ status: 'Closed', closingCash: 620000, expectedCash: 500000, discrepancy: 120000 });

    const noLongerCurrent = await request('/cashier-shifts/current');
    expect(noLongerCurrent.status).toBe(404);
    expect(error(noLongerCurrent).code).toBe('NOT_FOUND');
  });

  it('rejects invalid open and close payloads without changing state', async () => {
    const invalidOpen = await request('/cashier-shifts/open', 'POST', { branch_id: 1, register_code: 'SIDE', opening_cash: 100.5 });
    expect(invalidOpen.status).toBe(400);
    expect(error(invalidOpen).code).toBe('VALIDATION_ERROR');
    expect(db.cashierShifts).toHaveLength(0);

    await request('/cashier-shifts/open', 'POST', { branch_id: 1, register_code: 'MAIN', opening_cash: 10 });
    const invalidClose = await request('/cashier-shifts/1/close', 'POST', { closing_cash: -1 });
    expect(invalidClose.status).toBe(400);
    expect(error(invalidClose).code).toBe('VALIDATION_ERROR');
    expect(db.cashierShifts[0].status).toBe('Open');
  });
});
