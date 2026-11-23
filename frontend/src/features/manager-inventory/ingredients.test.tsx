// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { db } from '@/mocks/db';
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
  const session = await identityApi.login({ identifier: 'manager@smartcafe.vn', password: MOCK_PASSWORD });
  useAuthStore.getState().applySession(session);
});

describe('Quản lý nguyên liệu (/manager/ingredients)', () => {
  it('hiển thị danh sách nguyên liệu và phân trang', async () => {
    renderApp('/manager/ingredients');

    expect(await screen.findByRole('heading', { name: /Quản lý nguyên liệu/ })).toBeTruthy();
    expect(await screen.findByRole('table')).toBeTruthy();

    // Kiểm tra có nguyên liệu mẫu trong db
    expect(screen.getByText('Cà phê hạt Robusta')).toBeTruthy();
  });

  it('tìm kiếm nguyên liệu theo tên', async () => {
    renderApp('/manager/ingredients');

    const searchInput = await screen.findByPlaceholderText(/Tìm theo tên nguyên liệu/);
    fireEvent.change(searchInput, { target: { value: 'Sữa đặc' } });

    await waitFor(() => {
      expect(screen.getByText('Sữa đặc')).toBeTruthy();
      expect(screen.queryByText('Cà phê hạt Robusta')).toBeNull();
    });
  });

  it('thêm nguyên liệu mới qua modal', async () => {
    renderApp('/manager/ingredients');

    const addButton = await screen.findByRole('button', { name: /Thêm nguyên liệu/ });
    fireEvent.click(addButton);

    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByRole('heading', { name: 'Thêm nguyên liệu mới' })).toBeTruthy();

    fireEvent.change(within(modal).getByPlaceholderText(/Cà phê Arabica/), {
      target: { value: 'Bột Matcha Nhật Bản' },
    });
    fireEvent.change(within(modal).getByPlaceholderText(/g, ml, kg/), {
      target: { value: 'g' },
    });

    const submitBtn = within(modal).getByRole('button', { name: 'Tạo nguyên liệu' });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Đã tạo nguyên liệu mới')).toBeTruthy();
    expect(db.ingredients.some((i) => i.name === 'Bột Matcha Nhật Bản')).toBe(true);
  });
});
