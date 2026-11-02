// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { useOnlineCartStore } from '@/features/online-order/store';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { MOCK_PASSWORD, resetAuthMock } from '@/mocks/handlers/identity';
import { url } from '@/mocks/utils';
import { configureHttp, identityApi } from '@/shared/api';
import { resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';
import { useRecommendations } from './hooks/useRecommendations';

const server = setupServer(...handlers);
const requests: string[] = [];
beforeAll(() => {
  server.listen();
  polyfillDialog();
  configureHttp({ getToken: () => useAuthStore.getState().accessToken });
  server.events.on('request:start', ({ request }) => requests.push(`${request.method} ${new URL(request.url).pathname}`));
});
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  resetWorld();
  resetAuthMock();
  useOnlineCartStore.setState({ fulfillmentType: null, lines: [], voucherCode: null, delivery: null });
  requests.length = 0;
});

async function loginAs(identifier = 'customer@smartcafe.vn') {
  useAuthStore.getState().applySession(await identityApi.login({ identifier, password: MOCK_PASSWORD }));
}
const listRequests = () => requests.filter((r) => r.startsWith('GET') && r.endsWith('/intelligence/recommendations/me'));
const clickRequests = () => requests.filter((r) => r.startsWith('POST') && /\/intelligence\/recommendations\/\d+\/click$/.test(r));
const server500 = (method: 'get' | 'post', path: string, once = false) =>
  http[method](url(path), () => HttpResponse.json({ message: 'Máy chủ lỗi' }, { status: 500 }), { once });

const section = () => screen.getByRole('region', { name: /Gợi ý cho bạn/ });
const cardNames = () => within(section()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

// Thứ tự theo điểm tin cậy của khách u-customer sau khi lọc hết hạn / hết hàng / không bán (xem recommendation-seed.ts).
const CUSTOMER_ORDER = ['Trà đào cam sả', 'Bánh croissant', 'Bạc xỉu', 'Cacao đá xay', 'Americano'];

function hookWrapper() {
  // staleTime giống Providers của app: đổi tham số hook không được kéo theo request mới.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useRecommendations', () => {
  it('khách vãng lai: disabled và không gọi API', async () => {
    const { result } = renderHook(() => useRecommendations(), { wrapper: hookWrapper() });
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.state).toBe('disabled');
    expect(result.current.items).toEqual([]);
    expect(listRequests()).toHaveLength(0);
  });

  it('nhân viên (không phải khách hàng): disabled và không gọi API', async () => {
    await loginAs('staff@smartcafe.vn');
    const { result } = renderHook(() => useRecommendations(), { wrapper: hookWrapper() });
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.state).toBe('disabled');
    expect(listRequests()).toHaveLength(0);
  });

  it('loading → ready, đúng thứ tự điểm và kèm product', async () => {
    await loginAs();
    const { result } = renderHook(() => useRecommendations(), { wrapper: hookWrapper() });
    expect(result.current.state).toBe('loading');
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.items.map((r) => r.product.name)).toEqual(CUSTOMER_ORDER);
  });

  it('empty khi AI chưa có gợi ý', async () => {
    db.recommendations.length = 0;
    await loginAs();
    const { result } = renderHook(() => useRecommendations(), { wrapper: hookWrapper() });
    await waitFor(() => expect(result.current.state).toBe('empty'));
    expect(result.current.items).toEqual([]);
  });

  it('error khi server 500, refetch thành công thì sang ready', async () => {
    server.use(server500('get', '/intelligence/recommendations/me', true));
    await loginAs();
    const { result } = renderHook(() => useRecommendations(), { wrapper: hookWrapper() });
    await waitFor(() => expect(result.current.state).toBe('error'));
    result.current.refetch();
    await waitFor(() => expect(result.current.state).toBe('ready'));
  });

  it('đổi món đang xem chỉ lọc lại ở client: không có request mới, kết quả không bị lẫn món cũ', async () => {
    await loginAs();
    const { result, rerender } = renderHook(({ id }: { id?: number }) => useRecommendations({ excludeProductId: id }), {
      wrapper: hookWrapper(), initialProps: { id: 5 },
    });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.items.map((r) => r.productId)).not.toContain(5);

    rerender({ id: 2 });
    expect(result.current.items.map((r) => r.productId)).not.toContain(2);
    expect(result.current.items.map((r) => r.productId)).toContain(5);
    expect(listRequests()).toHaveLength(1);
  });

  it('chỉ còn đúng món đang xem → empty', async () => {
    db.recommendations.splice(0, db.recommendations.length, ...db.recommendations.filter((r) => r.id === 1));
    await loginAs();
    const { result } = renderHook(() => useRecommendations({ excludeProductId: 5 }), { wrapper: hookWrapper() });
    await waitFor(() => expect(result.current.state).toBe('empty'));
  });
});

describe('RecommendationSection – Home', () => {
  it('hiện skeleton khi đang tải, rồi tiêu đề + badge AI + các thẻ (tên, giá, lý do), chưa có nút thêm giỏ', async () => {
    db.products.find((p) => p.product.id === 5)!.product.image = 'https://example.com/tra-dao.png';
    await loginAs();
    renderApp('/home');
    expect(screen.getByRole('status', { name: 'Đang tải gợi ý' })).toBeTruthy();

    await waitFor(() => expect(cardNames()).toEqual(CUSTOMER_ORDER));
    const region = section();
    expect(within(region).getByRole('heading', { level: 2, name: /Gợi ý cho bạn/ })).toBeTruthy();
    expect(within(region).getByText('AI')).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Đang tải gợi ý' })).toBeNull();

    expect(within(region).getByText('Từ 45.000đ')).toBeTruthy(); // Trà đào cam sả: nhiều size → "Từ" giá thấp nhất
    expect(within(region).getByText('35.000đ')).toBeTruthy(); // Bánh croissant: một giá
    expect(within(region).getByText('Hợp khẩu vị thích đồ uống trái cây thanh mát')).toBeTruthy();
    // Ảnh có alt là tên món; món không có ảnh dùng icon trang trí (không render <img> hỏng)
    const images = within(region).getAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('alt')).toBe('Trà đào cam sả');
    expect(within(region).queryByRole('button')).toBeNull();
    // Món hết hàng / hết hạn / không bán không bao giờ xuất hiện
    expect(within(region).queryByText('Matcha latte')).toBeNull();
    expect(within(region).queryByText('Combo mùa thu')).toBeNull();
  });

  it('món không có lý do thì không hiện dòng lý do (UI không tự bịa)', async () => {
    await loginAs();
    renderApp('/home');
    await waitFor(() => expect(cardNames()).toContain('Americano'));
    const americano = within(section()).getByRole('link', { name: 'Americano' }).closest('article')!;
    expect(americano.querySelectorAll('p')).toHaveLength(0);
  });

  it('khách vãng lai: không có khối gợi ý và không gọi API, trang vẫn dùng bình thường', async () => {
    renderApp('/home');
    expect(await screen.findByRole('heading', { name: 'Món nổi bật' })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('heading', { name: /Gợi ý cho bạn/ })).toBeNull();
    expect(listRequests()).toHaveLength(0);
  });

  it('rỗng: hiện "AI đang học dữ liệu" thay vì ẩn khối', async () => {
    db.recommendations.length = 0;
    await loginAs();
    renderApp('/home');
    expect(await within(await screen.findByRole('region', { name: /Gợi ý cho bạn/ })).findByText(/AI đang học dữ liệu/)).toBeTruthy();
  });

  it('lỗi: thông báo nhẹ + nút Thử lại; bấm thử lại thì hiện gợi ý; phần còn lại của trang không vỡ', async () => {
    server.use(server500('get', '/intelligence/recommendations/me', true));
    await loginAs();
    renderApp('/home');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Chưa tải được gợi ý');
    expect(screen.getByRole('heading', { name: 'Món nổi bật' })).toBeTruthy();

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(cardNames()).toEqual(CUSTOMER_ORDER));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('RecommendationSection – click & thêm giỏ', () => {
  it('bấm thẻ: gọi track đúng id, ghi clickedAt và điều hướng tới chi tiết món', async () => {
    await loginAs();
    const { router } = renderApp('/home');
    await waitFor(() => expect(cardNames()).toEqual(CUSTOMER_ORDER));

    fireEvent.click(within(section()).getByRole('link', { name: 'Trà đào cam sả' }));
    expect(router.state.location.pathname).toBe('/menu/5');
    await waitFor(() => expect(clickRequests()).toHaveLength(1));
    expect(clickRequests()[0]).toMatch(/\/intelligence\/recommendations\/1\/click$/); // gợi ý id 1 = Trà đào cam sả
    await waitFor(() => expect(db.recommendations.find((r) => r.id === 1)?.clickedAt).toBeTruthy());
    expect(await screen.findByRole('heading', { level: 2, name: 'Trà đào cam sả' })).toBeTruthy();
  });

  it('track lỗi 500 không chặn điều hướng, chỉ log cảnh báo', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    server.use(server500('post', '/intelligence/recommendations/:id/click'));
    await loginAs();
    const { router } = renderApp('/home');
    await waitFor(() => expect(cardNames()).toEqual(CUSTOMER_ORDER));

    fireEvent.click(within(section()).getByRole('link', { name: 'Bánh croissant' }));
    expect(router.state.location.pathname).toBe('/menu/7');
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(await screen.findByRole('heading', { level: 2, name: 'Bánh croissant' })).toBeTruthy();
  });

  it('đã chọn Giao hàng/Mang đi: có nút thêm giỏ → chọn tuỳ chọn → món vào giỏ Online, không ghi click', async () => {
    useOnlineCartStore.setState({ fulfillmentType: 'Pickup' });
    await loginAs();
    renderApp('/home');
    await waitFor(() => expect(cardNames()).toEqual(CUSTOMER_ORDER));

    fireEvent.click(within(section()).getByRole('button', { name: 'Thêm Trà đào cam sả vào giỏ' }));
    const add = await screen.findByRole('button', { name: /^Thêm vào giỏ •/ });
    fireEvent.click(add);

    const lines = useOnlineCartStore.getState().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0].productId).toBe(5);
    expect(clickRequests()).toHaveLength(0);
  });
});

describe('RecommendationSection – ProductDetail', () => {
  it('loại chính món đang xem; bấm sang món khác thì danh sách đổi theo (không lẫn món cũ)', async () => {
    await loginAs();
    renderApp('/menu/5');
    expect(await screen.findByRole('heading', { level: 2, name: 'Trà đào cam sả' })).toBeTruthy();
    await waitFor(() => expect(cardNames()).toEqual(['Bánh croissant', 'Bạc xỉu', 'Cacao đá xay', 'Americano']));

    fireEvent.click(within(section()).getByRole('link', { name: 'Bạc xỉu' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Bạc xỉu' })).toBeTruthy();
    await waitFor(() => expect(cardNames()).toEqual(['Trà đào cam sả', 'Bánh croissant', 'Cacao đá xay', 'Americano']));
    await waitFor(() => expect(clickRequests()).toHaveLength(1));
  });

  it('nằm dưới phần tuỳ chọn và trên phần đánh giá', async () => {
    await loginAs();
    renderApp('/menu/5');
    const reco = await screen.findByRole('region', { name: /Gợi ý cho bạn/ });
    const options = screen.getByRole('group', { name: /Đường/ });
    expect(options.compareDocumentPosition(reco) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const reviews = await screen.findByRole('heading', { name: /Đánh giá/ });
    expect(reco.compareDocumentPosition(reviews) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('rỗng hoặc lỗi thì ẩn hẳn khối (không chen vào thanh thêm giỏ)', async () => {
    db.recommendations.length = 0;
    await loginAs();
    const first = renderApp('/menu/5');
    expect(await screen.findByRole('heading', { level: 2, name: 'Trà đào cam sả' })).toBeTruthy();
    await waitFor(() => expect(listRequests()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('heading', { name: /Gợi ý cho bạn/ })).toBeNull();
    first.unmount();

    server.use(server500('get', '/intelligence/recommendations/me'));
    renderApp('/menu/5');
    expect(await screen.findByRole('heading', { level: 2, name: 'Trà đào cam sả' })).toBeTruthy();
    await waitFor(() => expect(listRequests()).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('heading', { name: /Gợi ý cho bạn/ })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('khách vãng lai: trang chi tiết không có khối gợi ý', async () => {
    renderApp('/menu/5');
    expect(await screen.findByRole('heading', { level: 2, name: 'Trà đào cam sả' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Gợi ý cho bạn/ })).toBeNull();
    expect(listRequests()).toHaveLength(0);
  });
});
