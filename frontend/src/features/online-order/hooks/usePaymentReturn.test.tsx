// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import type { PayResult, PaymentGatewayStatus } from '@/shared/types';
import { RETURN_POLL_MS, RETURN_TIMEOUT_MS, usePaymentReturn } from './usePaymentReturn';

/** Polling sau khi quay về từ cổng: dùng fake timers, fetcher giả (kiểm tra cơ chế hẹn giờ, không qua mạng). */

const result = (status: PaymentGatewayStatus, orderId = 42): PayResult => ({
  payment: { id: 9, status, paymentMethod: 'VNPay', amount: 85_000, paidAt: status === 'Success' ? '2026-11-05T10:02:00Z' : null } as PayResult['payment'],
  allocations: [{ id: 1, paymentId: 9, orderId, allocatedAmount: 85_000, createdAt: '' }],
  redirectUrl: null,
  invoice: null,
});

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(fetchPayment: ReturnType<typeof vi.fn>, over: { orderId?: number | null; paymentId?: number | null } = {}) {
  return renderHook(() =>
    usePaymentReturn({ orderId: 42, paymentId: 9, ...over, fetchPayment: fetchPayment as never }),
  );
}

describe('usePaymentReturn', () => {
  it('mặc định: 2 giây một lần, timeout 60 giây', () => {
    expect([RETURN_POLL_MS, RETURN_TIMEOUT_MS]).toEqual([2_000, 60_000]);
  });

  it('poll theo interval: hỏi ngay khi mở, rồi mỗi 2 giây', async () => {
    const fetchPayment = vi.fn().mockResolvedValue(result('Pending'));
    const { result: hook } = setup(fetchPayment);

    await advance(0);
    expect(fetchPayment).toHaveBeenCalledTimes(1);
    expect(fetchPayment).toHaveBeenLastCalledWith(9, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(hook.current.phase).toBe('polling');

    await advance(1_999);
    expect(fetchPayment).toHaveBeenCalledTimes(1); // chưa tới 2 giây
    await advance(1);
    expect(fetchPayment).toHaveBeenCalledTimes(2);
    await advance(2_000);
    expect(fetchPayment).toHaveBeenCalledTimes(3);
    expect(hook.current.phase).toBe('polling');
  });

  it('không chồng request: request chưa trả về thì chưa hẹn lần kế tiếp', async () => {
    let resolveFirst: (r: PayResult) => void = () => undefined;
    const fetchPayment = vi.fn().mockImplementationOnce(() => new Promise<PayResult>((r) => { resolveFirst = r; })).mockResolvedValue(result('Pending'));
    setup(fetchPayment);

    await advance(10_000);
    expect(fetchPayment).toHaveBeenCalledTimes(1);
    resolveFirst(result('Pending'));
    await advance(2_000);
    expect(fetchPayment).toHaveBeenCalledTimes(2);
  });

  it('dừng khi status != Pending (Success) và không hỏi thêm', async () => {
    const fetchPayment = vi.fn()
      .mockResolvedValueOnce(result('Pending'))
      .mockResolvedValueOnce(result('Pending'))
      .mockResolvedValue(result('Success'));
    const { result: hook } = setup(fetchPayment);

    await advance(4_000);
    expect(fetchPayment).toHaveBeenCalledTimes(3);
    expect(hook.current).toMatchObject({ phase: 'settled', result: { payment: { status: 'Success' } } });

    await advance(RETURN_TIMEOUT_MS * 2);
    expect(fetchPayment).toHaveBeenCalledTimes(3);
    expect(hook.current.phase).toBe('settled'); // timeout không ghi đè kết quả đã chốt
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['Failed', 'Cancelled', 'Expired'] as const)('dừng khi status = %s', async (status) => {
    const fetchPayment = vi.fn().mockResolvedValueOnce(result('Pending')).mockResolvedValue(result(status));
    const { result: hook } = setup(fetchPayment);

    await advance(2_000);
    expect(hook.current).toMatchObject({ phase: 'settled', result: { payment: { status } } });
    await advance(30_000);
    expect(fetchPayment).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('timeout sau 60 giây: dừng hỏi, giữ kết quả cuối (Pending), không coi là chốt', async () => {
    const fetchPayment = vi.fn().mockResolvedValue(result('Pending'));
    const { result: hook } = setup(fetchPayment);

    await advance(RETURN_TIMEOUT_MS - 1);
    expect(hook.current.phase).toBe('polling');
    await advance(1);
    expect(hook.current).toMatchObject({ phase: 'timeout', result: { payment: { status: 'Pending' } } });

    const calls = fetchPayment.mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(30); // 0s, 2s, … 58s
    expect(calls).toBeLessThanOrEqual(31);
    await advance(30_000);
    expect(fetchPayment).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleanup khi unmount: xoá timer, huỷ request đang bay, không hỏi thêm', async () => {
    const signals: AbortSignal[] = [];
    const fetchPayment = vi.fn().mockImplementation((_id: number, o: { signal: AbortSignal }) => { signals.push(o.signal); return Promise.resolve(result('Pending')); });
    const { unmount } = setup(fetchPayment);

    await advance(2_000);
    expect(fetchPayment).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(signals.every((s) => s.aborted)).toBe(true);
    await advance(RETURN_TIMEOUT_MS);
    expect(fetchPayment).toHaveBeenCalledTimes(2);
  });

  it('unmount khi request đang chờ: kết quả về muộn không làm gì và không hẹn timer mới', async () => {
    let resolve: (r: PayResult) => void = () => undefined;
    const fetchPayment = vi.fn().mockImplementation(() => new Promise<PayResult>((r) => { resolve = r; }));
    const { unmount } = setup(fetchPayment);

    await advance(0);
    unmount();
    await act(async () => { resolve(result('Success')); await Promise.resolve(); });
    expect(vi.getTimerCount()).toBe(0);
    await advance(10_000);
    expect(fetchPayment).toHaveBeenCalledTimes(1);
  });

  it('lỗi tạm thời (mạng/5xx): vẫn hỏi lại, rồi chốt khi server trả kết quả', async () => {
    const fetchPayment = vi.fn()
      .mockRejectedValueOnce(new ApiError(0, { message: 'offline' }))
      .mockRejectedValueOnce(new ApiError(503, { message: 'busy' }))
      .mockResolvedValue(result('Success'));
    const { result: hook } = setup(fetchPayment);

    await advance(0);
    expect(hook.current).toMatchObject({ phase: 'polling', lastError: expect.any(ApiError) });
    await advance(4_000);
    expect(hook.current.phase).toBe('settled');
  });

  it.each([401, 403, 404])('lỗi %i không thể thử lại: dừng ngay với phase error', async (status) => {
    const fetchPayment = vi.fn().mockRejectedValue(new ApiError(status, { code: 'X', message: 'x' }));
    const { result: hook } = setup(fetchPayment);

    await advance(0);
    expect(hook.current.phase).toBe('error');
    await advance(10_000);
    expect(fetchPayment).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('giao dịch không thuộc đơn trên URL → error, dừng', async () => {
    const fetchPayment = vi.fn().mockResolvedValue(result('Success', 999));
    const { result: hook } = setup(fetchPayment);

    await advance(0);
    expect(hook.current.phase).toBe('error');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('thiếu orderId hoặc paymentId → invalid, không gọi API', async () => {
    const fetchPayment = vi.fn();
    const { result: hook } = setup(fetchPayment, { paymentId: null });
    await advance(10_000);
    expect(hook.current.phase).toBe('invalid');
    expect(fetchPayment).not.toHaveBeenCalled();
  });
});
