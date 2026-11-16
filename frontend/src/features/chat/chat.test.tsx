// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { chatMockConfig } from '@/mocks/handlers/chat';
import { url } from '@/mocks/utils';
import { loginAs, resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';

const server = setupServer(...handlers);
beforeAll(() => {
  server.listen();
  polyfillDialog();
});
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
beforeEach(() => {
  resetWorld();
  localStorage.clear();
  chatMockConfig.replyDelayMs = { min: 0, max: 0 };
});

const openPanel = async () => {
  renderAt();
  fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý AI' }));
  await waitUntilReady();
};
/** Ô nhập bị khoá đến khi phiên + lịch sử tải xong. */
const waitUntilReady = () => waitFor(() => expect((screen.getByRole('textbox', { name: 'Nhập tin nhắn' }) as HTMLTextAreaElement).disabled).toBe(false));
let current: ReturnType<typeof renderApp>;
const renderAt = (path = '/menu') => {
  current = renderApp(path);
};

const input = () => screen.getByRole('textbox', { name: 'Nhập tin nhắn' }) as HTMLTextAreaElement;
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });
const pressEnter = () => fireEvent.keyDown(input(), { key: 'Enter' });
const panel = () => screen.queryByRole('region', { name: 'Trợ lý AI' });
const log = () => screen.getByRole('log', { name: /Tin nhắn/ });

describe('FloatingChatBox — mở/đóng', () => {
  it('giữ chatbot mở khi chuyển từ chọn hình thức đặt món sang menu', async () => {
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý AI' }));

    expect(await screen.findByRole('region', { name: 'Trợ lý AI' })).toBeTruthy();
    expect(await screen.findByText(/Mình là trợ lý AI của quán/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Mang đi' }));
    await waitFor(() => expect(current.router.state.location.pathname).toBe('/menu'));
    expect(screen.getByRole('region', { name: 'Trợ lý AI' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Đóng trợ lý AI' })).toHaveLength(1);
  });

  it.each(['/dine-in/table/1', '/dine-in/pay/counter/1', '/payment/1'])(
    'có nút chatbot trên trang đặt món độc lập %s',
    (path) => {
      renderAt(path);
      expect(screen.getByRole('button', { name: 'Mở trợ lý AI' })).toBeTruthy();
    },
  );

  it('có nút nổi ở layout khách; bấm mở/đóng panel, Esc cũng đóng', async () => {
    renderAt();
    expect(panel()).toBeNull();
    const fab = screen.getByRole('button', { name: 'Mở trợ lý AI' });
    expect(fab.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(fab);
    expect(await screen.findByRole('region', { name: 'Trợ lý AI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đóng trợ lý AI' }).getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Đóng khung chat' }));
    expect(panel()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý AI' }));
    await screen.findByRole('region', { name: 'Trợ lý AI' });
    fireEvent.keyDown(screen.getByRole('region', { name: 'Trợ lý AI' }), { key: 'Escape' });
    expect(panel()).toBeNull();
  });

  it('trạng thái rỗng: lời chào + câu hỏi mẫu; bấm câu mẫu sẽ gửi', async () => {
    await openPanel();
    expect(screen.getByText(/Mình là trợ lý AI của quán/)).toBeTruthy();
    const chips = within(screen.getByLabelText('Câu hỏi gợi ý')).getAllByRole('button');
    expect(chips.length).toBeGreaterThan(0);

    fireEvent.click(within(screen.getByLabelText('Câu hỏi gợi ý')).getByRole('button', { name: 'Gợi ý đồ uống ít đắng' }));
    expect(await within(log()).findByRole('list', { name: 'Món gợi ý' })).toBeTruthy();
  });
});

describe('FloatingChatBox — hội thoại', () => {
  it('khách vãng lai: guestKey được tạo + lưu, "gợi ý đồ uống ít đắng" → typing → 2–3 thẻ → bấm thẻ sang /menu/:id', async () => {
    chatMockConfig.replyDelayMs = { min: 250, max: 250 };
    await openPanel();

    const key = localStorage.getItem('smartcafe.chat.guestKey');
    expect(key).toBeTruthy();
    expect(db.chatSessions).toHaveLength(1);
    expect(db.chatSessions[0]).toMatchObject({ guestKey: key, userId: null });

    type('gợi ý đồ uống ít đắng');
    pressEnter();

    // tin khách hiện ngay + ô nhập bị khoá + "AI đang trả lời…"
    expect(await within(log()).findByText('gợi ý đồ uống ít đắng')).toBeTruthy();
    expect(await screen.findByRole('status', { name: 'AI đang trả lời' })).toBeTruthy();
    expect(input().disabled).toBe(true);
    expect(input().value).toBe('');

    const list = await within(log()).findByRole('list', { name: 'Món gợi ý' });
    expect(screen.queryByRole('status', { name: 'AI đang trả lời' })).toBeNull();
    const links = within(list).getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.length).toBeLessThanOrEqual(3);
    await waitFor(() => expect(input().disabled).toBe(false));

    // thẻ lấy từ catalog thật: tên + giá, link dùng router (không reload trang)
    const first = links[0]!;
    const productId = Number(first.getAttribute('href')!.split('/').pop());
    const product = db.products.find((s) => s.product.id === productId)!.product;
    expect(first.textContent).toContain(product.name);
    expect(first.textContent).toMatch(/\d\.\d{3}đ/);

    fireEvent.click(first);
    await waitFor(() => expect(current.router.state.location.pathname).toBe(`/menu/${productId}`));
    expect(panel()).toBeNull(); // panel thu lại để không che trang món
  });

  it('Shift+Enter không gửi; Enter với nội dung rỗng không gửi', async () => {
    await openPanel();
    type('dòng 1');
    fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true });
    expect(db.chatMessages).toHaveLength(0);

    type('   ');
    pressEnter();
    expect(db.chatMessages).toHaveLength(0);
    expect((screen.getByRole('button', { name: 'Gửi tin nhắn' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('không gửi khi đang gõ dấu tiếng Việt (IME composing)', async () => {
    await openPanel();
    type('cà phê');
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    expect(db.chatMessages).toHaveLength(0);
  });

  it('đóng rồi mở lại panel vẫn còn lịch sử, không tạo phiên mới', async () => {
    await openPanel();
    type('xin chào');
    pressEnter();
    await within(log()).findByText(/Mình là trợ lý AI của quán/);

    fireEvent.click(screen.getByRole('button', { name: 'Đóng trợ lý AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý AI' }));
    await waitUntilReady();
    expect(within(log()).getByText('xin chào')).toBeTruthy();
    expect(db.chatSessions).toHaveLength(1);
  });

  it('F5 (dựng lại app) vẫn nhận lại phiên cũ nhờ guestKey đã lưu', async () => {
    await openPanel();
    type('xin chào');
    pressEnter();
    await within(log()).findByText(/Mình là trợ lý AI của quán/);
    cleanup();

    await openPanel();
    expect(await within(log()).findByText('xin chào')).toBeTruthy();
    expect(db.chatSessions).toHaveLength(1);
  });

  it('người đã đăng nhập dùng userId thay vì guestKey', async () => {
    loginAs('Customer', { id: 'u-42' });
    await openPanel();
    expect(db.chatSessions[0]).toMatchObject({ userId: 'u-42', guestKey: null });
    expect(localStorage.getItem('smartcafe.chat.guestKey')).toBeNull();
  });
});

describe('FloatingChatBox — chuyển nhân viên', () => {
  it('bấm "Chuyển nhân viên" → hiển thị đang chờ; nhắn thêm thì không có lượt AI tự động', async () => {
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: /Chuyển nhân viên/ }));

    expect(await within(log()).findByText(/Đã chuyển cho nhân viên/)).toBeTruthy();
    expect(db.chatSessions[0]!.status).toBe('Waiting_Staff');
    expect((screen.getByRole('button', { name: /Chuyển nhân viên/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(input().placeholder).toMatch(/nhân viên/);

    type('gợi ý đồ uống ít đắng');
    pressEnter();
    expect(await within(log()).findByText('gợi ý đồ uống ít đắng')).toBeTruthy();
    await waitFor(() => expect(input().disabled).toBe(false));
    expect(screen.queryByRole('status', { name: 'AI đang trả lời' })).toBeNull();
    expect(within(log()).queryByRole('list', { name: 'Món gợi ý' })).toBeNull();
    expect(db.chatMessages.map((m) => m.senderRole)).toEqual(['Customer']);
  });

  it('mở lại sau F5 vẫn thấy trạng thái đã chuyển nhân viên', async () => {
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: /Chuyển nhân viên/ }));
    await within(log()).findByText(/Đã chuyển cho nhân viên/);
    cleanup();

    await openPanel();
    expect(await within(log()).findByText(/Đã chuyển cho nhân viên/)).toBeTruthy();
  });

  it('handoff lỗi → báo lỗi, cho thử lại', async () => {
    await openPanel();
    server.use(http.post(url('/intelligence/chat/sessions/:id/handoff'), () => HttpResponse.json({ message: 'Lỗi' }, { status: 500 }), { once: true }));
    fireEvent.click(screen.getByRole('button', { name: /Chuyển nhân viên/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Chưa chuyển được/);

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await within(log()).findByText(/Đã chuyển cho nhân viên/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('FloatingChatBox — lỗi', () => {
  it('gửi thất bại → báo lỗi, bỏ tin tạm, "Thử lại" gửi lại đúng nội dung', async () => {
    await openPanel();
    server.use(
      http.post(url('/intelligence/chat/sessions/:id/messages'), () => HttpResponse.json({ message: 'Lỗi máy chủ' }, { status: 500 }), { once: true }),
    );
    type('gợi ý đồ uống ít đắng');
    pressEnter();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Không gửi được tin nhắn/);
    expect(within(log()).queryByText('gợi ý đồ uống ít đắng')).toBeNull(); // tin tạm đã được gỡ
    expect(db.chatMessages).toHaveLength(0);

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await within(log()).findByRole('list', { name: 'Món gợi ý' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(log()).getByText('gợi ý đồ uống ít đắng')).toBeTruthy();
  });

  it('không tạo được phiên → báo lỗi + thử lại', async () => {
    server.use(http.post(url('/intelligence/chat/sessions'), () => HttpResponse.json({ message: 'Lỗi' }, { status: 500 }), { once: true }));
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý AI' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Không kết nối được/);

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    await screen.findByText(/Mình là trợ lý AI của quán/);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
