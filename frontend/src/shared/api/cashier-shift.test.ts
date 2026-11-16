import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { http as mswHttp, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ApiError, configureHttp } from './http';
import { closeCashierShift, getCurrentCashierShift, NoOpenCashierShiftError, openCashierShift } from './cashier-shift';

const U = (path: string) => `http://localhost/api${path}`;
const server = setupServer();
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => configureHttp({ getToken: () => 'tok-shift', onUnauthorized: undefined, refresh: undefined }));

const data = (body: unknown, status = 200) => HttpResponse.json({ success: true, data: body, meta: null, trace_id: 'shift-trace' }, { status });
const failure = (status: number, code: string) => HttpResponse.json({ success: false, error: { code, message: 'server error' }, trace_id: 'err-trace' }, { status });
const wireShift = {
  id: 12, branch_id: 4, register_code: 'MAIN', staff_user_id: 'staff-1', opening_time: '2026-11-11T08:00:00Z',
  opening_cash: '500000', total_orders: 8, total_cash_sales: '125000', expected_cash: '625000',
  status: 'Open', closing_time: null, closing_cash: null, discrepancy: null,
};

describe('Cashier Shift API', () => {
  it('opens with the specified method, path, snake_case body and maps response', async () => {
    let captured: { method: string; path: string; body: unknown } | null = null;
    server.use(mswHttp.post(U('/cashier-shifts/open'), async ({ request }) => {
      captured = { method: request.method, path: new URL(request.url).pathname, body: await request.json() };
      return data(wireShift, 201);
    }));
    const result = await openCashierShift({ branchId: 4, openingCash: 500000 });
    expect(captured).toEqual({ method: 'POST', path: '/api/cashier-shifts/open', body: { branch_id: 4, register_code: 'MAIN', opening_cash: 500000 } });
    expect(result).toMatchObject({ id: 12, branchId: 4, openingCash: 500000, expectedCash: 625000, totalCashSales: 125000 });
  });

  it('gets current without query params and maps current response', async () => {
    let captured: { method: string; path: string; search: string } | null = null;
    server.use(mswHttp.get(U('/cashier-shifts/current'), ({ request }) => {
      const url = new URL(request.url);
      captured = { method: request.method, path: url.pathname, search: url.search };
      return data(wireShift);
    }));
    expect(await getCurrentCashierShift()).toMatchObject({ id: 12, status: 'Open' });
    expect(captured).toEqual({ method: 'GET', path: '/api/cashier-shifts/current', search: '' });
  });

  it('closes using path id and closing_cash, mapping close summary from server values', async () => {
    let captured: { method: string; path: string; body: unknown } | null = null;
    server.use(mswHttp.post(U('/cashier-shifts/12/close'), async ({ request }) => {
      captured = { method: request.method, path: new URL(request.url).pathname, body: await request.json() };
      return data({ ...wireShift, status: 'Closed', closing_cash: '620000', expected_cash: '625000', discrepancy: '-5000' });
    }));
    const result = await closeCashierShift(12, { closingCash: 620000 });
    expect(captured).toEqual({ method: 'POST', path: '/api/cashier-shifts/12/close', body: { closing_cash: 620000 } });
    expect(result).toMatchObject({ cashierShift: { status: 'Closed' }, expectedCash: 625000, discrepancy: -5000 });
  });

  it('distinguishes current 404 as no open shift and retains the ApiError', async () => {
    server.use(mswHttp.get(U('/cashier-shifts/current'), () => failure(404, 'NOT_FOUND')));
    const error = await getCurrentCashierShift().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(NoOpenCashierShiftError);
    expect(error).toMatchObject({ status: 404, apiError: { code: 'NOT_FOUND', traceId: 'err-trace' } });
  });

  it.each([401, 403, 409])('preserves ApiError %i on open', async (status) => {
    server.use(mswHttp.post(U('/cashier-shifts/open'), () => failure(status, `ERR_${status}`)));
    const error = await openCashierShift({ branchId: 4, openingCash: 0 }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code: `ERR_${status}`, traceId: 'err-trace' });
  });
});
