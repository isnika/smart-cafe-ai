// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QrScanner } from './QrScanner';

const setup = (onManual = vi.fn()) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <QrScanner onDone={vi.fn()} onManual={onManual} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('QrScanner', () => {
  it('bị từ chối quyền camera → báo lỗi và vẫn có lối nhập mã tay', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const onManual = vi.fn();
    setup(onManual);
    expect((await screen.findByRole('alert')).textContent).toContain('chưa được cấp quyền');
    fireEvent.click(screen.getByRole('button', { name: 'Nhập mã bàn thay thế' }));
    expect(onManual).toHaveBeenCalled();
  });

  it('trình duyệt không có camera API → báo lỗi', async () => {
    vi.stubGlobal('navigator', {});
    setup();
    expect((await screen.findByRole('alert')).textContent).toContain('không hỗ trợ camera');
  });

  it('có camera → mở stream và tắt hết track khi đóng', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    const { unmount } = setup();
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Hướng camera'));
    expect(getUserMedia).toHaveBeenCalledOnce();
    unmount();
    expect(stop).toHaveBeenCalled();
  });
});
