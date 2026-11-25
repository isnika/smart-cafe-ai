// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { handlers } from '@/mocks/handlers';
import { MOCK_PASSWORD, resetAuthMock } from '@/mocks/handlers/identity';
import { configureHttp, identityApi } from '@/shared/api';
import { resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';

const server = setupServer(...handlers);
beforeAll(() => {
  server.listen();
  polyfillDialog();
  configureHttp({ getToken: () => useAuthStore.getState().accessToken });
});
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
beforeEach(async () => {
  resetWorld();
  resetAuthMock();
});

describe('Quản lý đơn hàng (/manager/orders & /admin/orders)', () => {
  it('Manager đăng nhập và mở trang /manager/orders', async () => {
    const session = await identityApi.login({ identifier: 'manager@smartcafe.vn', password: MOCK_PASSWORD });
    useAuthStore.getState().applySession(session);

    renderApp('/manager/orders');

    expect(await screen.findByRole('heading', { name: /Quản lý đơn hàng/ })).toBeTruthy();
    expect(await screen.findByText('Tổng đơn')).toBeTruthy();
    expect(screen.getByPlaceholderText(/Tìm theo mã đơn hoặc số bàn/)).toBeTruthy();
  });

  it('Admin đăng nhập và mở trang /admin/orders có bộ lọc chi nhánh', async () => {
    const session = await identityApi.login({ identifier: 'admin@smartcafe.vn', password: MOCK_PASSWORD });
    useAuthStore.getState().applySession(session);

    renderApp('/admin/orders');

    expect(await screen.findByRole('heading', { name: /Quản lý đơn hàng/ })).toBeTruthy();
    expect(await screen.findByLabelText('Chọn chi nhánh')).toBeTruthy();
  });
});
