// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handlers } from '@/mocks/handlers';
import { resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';

const server = setupServer(...handlers);
beforeAll(() => { server.listen(); polyfillDialog(); });
afterAll(() => server.close());
afterEach(() => { cleanup(); server.resetHandlers(); });
beforeEach(resetWorld);

describe('Tìm món trên trang chủ và thực đơn', () => {
  it.each(['/home', '/menu'])('lọc ngay sau khi gõ một chữ cái tại %s', async (path) => {
    renderApp(path);
    const search = await screen.findByRole('searchbox', { name: 'Tìm món theo tên' });
    await screen.findByRole('link', { name: 'Americano' });
    fireEvent.change(search, { target: { value: 'c' } });
    expect(screen.getByRole('link', { name: 'Cà phê sữa đá' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Americano' })).toBeTruthy();
    fireEvent.change(search, { target: { value: 'sua' } });
    expect(screen.getByRole('link', { name: 'Cà phê sữa đá' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Cacao đá xay' })).toBeNull();
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByRole('link', { name: 'Americano' })).toBeTruthy();
  });

  it('tìm không dấu trên trang chủ và giữ từ khóa, danh mục khi xem tất cả', async () => {
    renderApp('/home');
    const section = (await screen.findByRole('heading', { name: 'Món nổi bật' })).closest('section')!;
    await within(section).findAllByRole('article');
    fireEvent.change(within(section).getByRole('searchbox'), { target: { value: 'ca phe sua da' } });
    expect(within(section).getByRole('link', { name: 'Cà phê sữa đá' })).toBeTruthy();
    expect(within(section).queryByRole('link', { name: 'Bạc xỉu' })).toBeNull();
    fireEvent.click(within(section).getByRole('button', { name: 'Cà phê' }));
    expect(within(section).getByRole('link', { name: 'Xem tất cả' }).getAttribute('href')).toBe('/menu?category=1&q=ca+phe+sua+da');
    fireEvent.click(within(section).getByRole('button', { name: 'Bánh ngọt' }));
    expect(within(section).getByText(/Không tìm thấy món phù hợp/)).toBeTruthy();
  });

  it('kết hợp tìm kiếm và danh mục trên thực đơn, xóa bộ lọc và giữ tham số khi đổi danh mục', async () => {
    const { router } = renderApp('/menu?q=banh');
    await screen.findByRole('link', { name: 'Bánh croissant' });
    const search = screen.getByRole('searchbox', { name: 'Tìm món theo tên' });
    const group = await screen.findByRole('group', { name: 'Danh mục món' });
    fireEvent.click(within(group).getByRole('button', { name: 'Cà phê' }));
    expect(screen.getByText(/Không tìm thấy món phù hợp/)).toBeTruthy();
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe('banh');
    fireEvent.change(search, { target: { value: 'CA PHE SUA DA' } });
    await screen.findByRole('link', { name: 'Cà phê sữa đá' });
    fireEvent.change(search, { target: { value: '' } });
    await waitFor(() => expect(screen.getByRole('link', { name: 'Bạc xỉu' })).toBeTruthy());
    expect(new URLSearchParams(router.state.location.search).get('category')).toBe('1');
    fireEvent.click(within(group).getByRole('button', { name: 'Tất cả' }));
    expect(screen.getByRole('link', { name: 'Bánh croissant' })).toBeTruthy();
  });
});
