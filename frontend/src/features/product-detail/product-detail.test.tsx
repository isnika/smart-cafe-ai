// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useDineInCartStore } from '@/features/dine-in/store';
import { useOnlineCartStore, type OnlineFulfillment } from '@/features/online-order/store';
import { handlers } from '@/mocks/handlers';
import { mockConfig, url } from '@/mocks/utils';
import { catalogApi } from '@/shared/api';
import { resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';

const server = setupServer(...handlers);
const requests: string[] = [];
beforeAll(() => {
  server.listen();
  polyfillDialog();
  server.events.on('request:start', ({ request }) => requests.push(`${request.method} ${new URL(request.url).pathname}`));
});
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
beforeEach(() => {
  resetWorld();
  useOnlineCartStore.setState({ fulfillmentType: null, lines: [], voucherCode: null, delivery: null });
  requests.length = 0;
});

const online = (type: OnlineFulfillment = 'Pickup') => useOnlineCartStore.setState({ fulfillmentType: type });
const addButton = () => screen.getByRole('button', { name: /Thêm vào giỏ|Chọn |Hết hàng/ }) as HTMLButtonElement;
const server500 = (path: string) => http.get(url(path), () => HttpResponse.json({ message: 'Máy chủ lỗi' }, { status: 500 }));

describe('/menu/:id – hiển thị', () => {
  it('thành công: tên, danh mục, mô tả/giá, còn hàng, size, nhóm tuỳ chọn, số lượng; không cần đăng nhập', async () => {
    online();
    const { router } = renderApp('/menu/1');
    expect(await screen.findByRole('heading', { level: 2, name: 'Cà phê sữa đá' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/menu/1'); // không bị chuyển sang /login
    expect(screen.getByRole('heading', { level: 1, name: 'Chi tiết món' })).toBeTruthy();
    expect(await screen.findByText('Cà phê')).toBeTruthy(); // danh mục (từ /catalog/categories)
    expect(screen.getByText('Còn hàng')).toBeTruthy();

    // Size: S là "Gốc", các size khác là chênh lệch
    const size = screen.getByRole('group', { name: 'Chọn size' });
    expect(within(size).getAllByRole('radio')).toHaveLength(3);
    expect(within(size).getByRole('radio', { name: /^S\s*Gốc/ })).toBeTruthy();
    expect(within(size).getByRole('radio', { name: /^M\s*\+ 6\.000đ/ })).toBeTruthy();
    expect(within(size).getByRole('radio', { name: /^L\s*\+ 10\.000đ/ })).toBeTruthy();

    // Nhóm tuỳ chọn lấy từ API: Đường (bắt buộc, có mặc định) + Topping
    expect(screen.getByRole('group', { name: /Đường \(Bắt buộc\)/ })).toBeTruthy();
    expect(screen.getByRole('group', { name: /Topping \(Tối đa 2\)/ })).toBeTruthy();
    expect((screen.getByRole('radio', { name: '100% đường' }) as HTMLInputElement).checked).toBe(true);

    expect(screen.getByRole('button', { name: 'Tăng số lượng Cà phê sữa đá' })).toBeTruthy();
    expect(addButton().textContent).toBe('Thêm vào giỏ • 29.000đ'); // size S, chưa có topping
  });

  it('loading: skeleton có aria-busy trong lúc chờ API', async () => {
    mockConfig.latencyMs = 60;
    renderApp('/menu/1');
    expect(screen.getByLabelText('Đang tải sản phẩm').hasAttribute('aria-busy')).toBe(true);
    expect(await screen.findByRole('heading', { level: 2, name: 'Cà phê sữa đá' })).toBeTruthy();
    expect(screen.queryByLabelText('Đang tải sản phẩm')).toBeNull();
  });

  it('API trả 404 → "Không tìm thấy sản phẩm" + nút quay lại /menu (không thử lại)', async () => {
    const { router } = renderApp('/menu/999');
    expect(await screen.findByText('Không tìm thấy sản phẩm')).toBeTruthy();
    expect(requests.filter((r) => r === 'GET /api/catalog/products/999' || r.endsWith('/catalog/products/999'))).toHaveLength(1);
    fireEvent.click(screen.getByRole('link', { name: 'Quay lại thực đơn' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/menu'));
  });

  it('id không hợp lệ → không tìm thấy ngay, không gọi API catalog', async () => {
    renderApp('/menu/abc');
    expect(await screen.findByText('Không tìm thấy sản phẩm')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Quay lại thực đơn' }).getAttribute('href')).toBe('/menu');
    expect(requests.some((r) => r.includes('/catalog/products/'))).toBe(false);
  });

  it('lỗi máy chủ → báo lỗi có "Thử lại"; thử lại thành công thì hiện món', async () => {
    server.use(server500('/catalog/products/:id'));
    renderApp('/menu/1');
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 }); // hook thử lại 1 lần (~1s) trước khi báo lỗi
    expect(alert.textContent).toContain('Không tải được sản phẩm');
    expect(screen.queryByText('Không tìm thấy sản phẩm')).toBeNull();
    expect(within(alert).getByRole('link', { name: 'Quay lại thực đơn' })).toBeTruthy();

    server.resetHandlers();
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Cà phê sữa đá' })).toBeTruthy();
  });

  it('hết hàng: badge "Hết hàng", nút thêm bị khoá', async () => {
    online();
    renderApp('/menu/4'); // Matcha latte – variant duy nhất hết hàng ở chi nhánh 1
    await screen.findByRole('heading', { level: 2, name: 'Matcha latte' });
    expect(screen.getAllByText('Hết hàng')).toHaveLength(2); // badge + nhãn nút
    expect(addButton().disabled).toBe(true);
    expect(addButton().textContent).toBe('Hết hàng');
    expect(screen.queryByText('Còn hàng')).toBeNull();
  });

  it('món không có size/option (bánh) vẫn thêm được, không có khối chọn size', async () => {
    online();
    renderApp('/menu/7');
    await screen.findByRole('heading', { level: 2, name: 'Bánh croissant' });
    expect(screen.queryByRole('group', { name: 'Chọn size' })).toBeNull();
    expect(addButton().textContent).toBe('Thêm vào giỏ • 35.000đ');
    expect(addButton().disabled).toBe(false);
  });

  it('ảnh: thiếu ảnh → khối icon; có ảnh nhưng lỗi tải → chuyển sang icon, không để <img> hỏng', async () => {
    renderApp('/menu/1');
    await screen.findByRole('heading', { level: 2, name: 'Cà phê sữa đá' });
    expect(screen.queryByRole('img', { name: 'Cà phê sữa đá' })).toBeNull(); // mock không có ảnh
    cleanup();

    const base = await catalogApi.getProduct(1, 1);
    server.use(http.get(url('/catalog/products/:id'), () => HttpResponse.json({ ...base, image: 'http://localhost/khong-ton-tai.png' })));
    renderApp('/menu/1');
    const img = await screen.findByRole('img', { name: 'Cà phê sữa đá' });
    expect(img.getAttribute('src')).toBe('http://localhost/khong-ton-tai.png');
    fireEvent.error(img);
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Cà phê sữa đá' })).toBeNull());
  });

  it('nút quay lại về /menu', async () => {
    const { router } = renderApp('/menu/1');
    await screen.findByRole('heading', { level: 2, name: 'Cà phê sữa đá' });
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/menu'));
  });
});

describe('/menu/:id – chọn tuỳ chọn, giá tạm tính, thêm vào giỏ', () => {
  it('đổi size, bật topping, tăng số lượng → giá cập nhật đúng; thêm vào giỏ Online với đúng lựa chọn', async () => {
    online('Delivery');
    renderApp('/menu/1');
    await screen.findByRole('heading', { level: 2, name: 'Cà phê sữa đá' });

    fireEvent.click(screen.getByRole('radio', { name: /^M/ }));
    expect(addButton().textContent).toBe('Thêm vào giỏ • 35.000đ');
    fireEvent.click(screen.getByRole('checkbox', { name: /Trân châu/ }));
    expect(addButton().textContent).toBe('Thêm vào giỏ • 45.000đ');
    fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng Cà phê sữa đá' }));
    expect(addButton().textContent).toBe('Thêm vào giỏ • 90.000đ');
    fireEvent.click(screen.getByRole('button', { name: 'Giảm số lượng Cà phê sữa đá' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng Cà phê sữa đá' }));

    fireEvent.click(addButton());
    const lines = useOnlineCartStore.getState().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ productId: 1, variantId: 12, variantName: 'M', unitPrice: 35_000, quantity: 2 });
    expect(lines[0]!.options.map((o) => o.optionId).sort()).toEqual([101, 104]);
    expect(useDineInCartStore.getState().lines).toHaveLength(0); // không rò sang giỏ Dine-in

    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Đã thêm vào giỏ hàng');
    expect(within(status).getByRole('link', { name: 'Xem giỏ hàng (2)' }).getAttribute('href')).toBe('/cart');
    expect(addButton().textContent).toBe('Thêm vào giỏ • 45.000đ'); // số lượng về 1 sau khi thêm

    // thêm lại đúng lựa chọn đó → gộp vào cùng dòng
    fireEvent.click(addButton());
    expect(useOnlineCartStore.getState().lines).toHaveLength(1);
    expect(useOnlineCartStore.getState().lines[0]!.quantity).toBe(3);
  });

  it('topping tối đa 2: không chọn được cái thứ 3; nhóm Đường bắt buộc luôn còn một lựa chọn', async () => {
    online();
    renderApp('/menu/1');
    await screen.findByRole('heading', { level: 2, name: 'Cà phê sữa đá' });
    for (const name of [/Trân châu/, /Thạch cà phê/, /Kem cheese/]) fireEvent.click(screen.getByRole('checkbox', { name }));
    expect(screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked)).toHaveLength(2);
    expect((screen.getByRole('checkbox', { name: /Kem cheese/ }) as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole('radio', { name: '70% đường' }));
    expect((screen.getByRole('radio', { name: '70% đường' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: '100% đường' }) as HTMLInputElement).checked).toBe(false);
  });

  it('chưa chọn Giao hàng / Mang đi → nút thêm bị khoá và có lối vào luồng đặt món', async () => {
    renderApp('/menu/1');
    await screen.findByRole('heading', { level: 2, name: 'Cà phê sữa đá' });
    expect(addButton().disabled).toBe(true);
    expect(screen.getByRole('link', { name: 'Bắt đầu đặt món' }).getAttribute('href')).toBe('/');
    fireEvent.click(addButton());
    expect(useOnlineCartStore.getState().lines).toHaveLength(0);
  });

  it('size hết hàng bị khoá, không chọn được', async () => {
    online();
    const base = await catalogApi.getProduct(1, 1);
    const variants = base.variants.map((v) => (v.variantName === 'M' ? { ...v, isAvailable: false } : v));
    server.use(http.get(url('/catalog/products/:id'), () => HttpResponse.json({ ...base, variants })));
    renderApp('/menu/1');
    await screen.findByRole('heading', { level: 2, name: 'Cà phê sữa đá' });
    const m = screen.getByRole('radio', { name: /^M/ }) as HTMLInputElement;
    expect(m.disabled).toBe(true);
    expect(m.closest('label')!.textContent).toContain('Hết hàng');
    expect((screen.getByRole('radio', { name: /^S/ }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('/menu/:id – đánh giá', () => {
  it('điểm trung bình + số đánh giá, danh sách mới nhất trước, "Xem thêm đánh giá" tải trang 2, review bị ẩn không hiện', async () => {
    renderApp('/menu/1');
    const list = await screen.findByRole('list', { name: 'Danh sách đánh giá' });
    expect(screen.getByRole('heading', { level: 2, name: 'Đánh giá' })).toBeTruthy();
    expect(screen.getByText('4,4')).toBeTruthy(); // (5+5+4+5+3+4+5)/7
    expect(screen.getByText('7 đánh giá')).toBeTruthy();
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(within(list).getAllByRole('listitem')[0]!.textContent).toContain('Minh Anh'); // mới nhất

    fireEvent.click(screen.getByRole('button', { name: 'Xem thêm đánh giá' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(7));
    expect(screen.queryByRole('button', { name: 'Xem thêm đánh giá' })).toBeNull();
    expect(screen.queryByText(/đã bị ẩn bởi quản lý/)).toBeNull();
    expect(screen.getByText('Ngọc Hân')).toBeTruthy();
    expect(within(list).getAllByRole('img', { name: /trên 5 sao/ })).toHaveLength(7);
  });

  it('review chỉ có điểm (không nội dung) vẫn hiển thị', async () => {
    renderApp('/menu/2');
    const list = await screen.findByRole('list', { name: 'Danh sách đánh giá' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('Bảo Châu')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xem thêm đánh giá' })).toBeNull();
  });

  it('chưa có review → "Chưa có đánh giá"', async () => {
    renderApp('/menu/3');
    expect(await screen.findByText('Chưa có đánh giá')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Danh sách đánh giá' })).toBeNull();
  });

  it('review đang tải: skeleton riêng, phần chi tiết món hiện bình thường', async () => {
    server.use(
      http.get(url('/engagement/products/:id/reviews'), async () => {
        await new Promise((r) => setTimeout(r, 150));
        return HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 5, averageRating: null });
      }),
    );
    renderApp('/menu/1');
    await screen.findByRole('heading', { level: 2, name: 'Cà phê sữa đá' });
    expect(screen.getByLabelText('Đang tải đánh giá')).toBeTruthy();
    expect(await screen.findByText('Chưa có đánh giá')).toBeTruthy();
  });

  it('review lỗi: báo lỗi riêng + Thử lại, KHÔNG chặn chi tiết món và nút thêm vào giỏ', async () => {
    online();
    server.use(server500('/engagement/products/:id/reviews'));
    renderApp('/menu/1');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Không tải được đánh giá');
    expect(screen.getByRole('heading', { level: 2, name: 'Cà phê sữa đá' })).toBeTruthy();
    expect(addButton().disabled).toBe(false);
    fireEvent.click(addButton());
    expect(useOnlineCartStore.getState().lines).toHaveLength(1);

    server.resetHandlers();
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('7 đánh giá')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('liên kết từ menu sang /menu/:id', () => {
  it('thẻ món ở /menu (khách chưa chọn hình thức) là liên kết tới trang chi tiết', async () => {
    const { router } = renderApp('/menu');
    const link = await screen.findByRole('link', { name: 'Cà phê sữa đá' });
    expect(link.getAttribute('href')).toBe('/menu/1');
    fireEvent.click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe('/menu/1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Chi tiết món' })).toBeTruthy();
  });

  it('chế độ Online: tên món dẫn tới chi tiết, nút "+" vẫn mở modal tuỳ chọn tại chỗ', async () => {
    online();
    const { router } = renderApp('/menu');
    const link = await screen.findByRole('link', { name: 'Cà phê sữa đá' });
    expect(link.getAttribute('href')).toBe('/menu/1');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm Cà phê sữa đá' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/menu');
  });

  it('món ở trang chủ cũng mở được chi tiết', async () => {
    renderApp('/home');
    const link = await screen.findByRole('link', { name: 'Cà phê sữa đá' });
    expect(link.getAttribute('href')).toBe('/menu/1');
  });

  it('trang QR tại bàn không bị thêm liên kết (không rời luồng đặt tại bàn)', async () => {
    renderApp('/dine-in/table/QR-B1-T01');
    await screen.findByText('Smart Cafe QR Ordering');
    await screen.findByRole('button', { name: 'Thêm Cà phê sữa đá' });
    expect(screen.queryAllByRole('link').some((a) => (a.getAttribute('href') ?? '').startsWith('/menu/'))).toBe(false);
  });
});
