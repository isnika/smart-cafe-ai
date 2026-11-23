// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handlers } from '@/mocks/handlers';
import { chatMockConfig } from '@/mocks/handlers/chat';
import { url } from '@/mocks/utils';
import { loginAs, resetWorld } from '@/test/helpers';
import { renderApp } from '@/test/renderApp';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
beforeEach(() => {
  resetWorld();
  chatMockConfig.replyDelayMs = { min: 0, max: 0 };
});

let current: ReturnType<typeof renderApp>;
const renderAt = (path = '/menu') => {
  current = renderApp(path);
};
const input = () => screen.getByRole('textbox', { name: 'Nhập tin nhắn' }) as HTMLTextAreaElement;
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });
const pressEnter = () => fireEvent.keyDown(input(), { key: 'Enter' });
const panel = () => screen.queryByRole('region', { name: 'Trợ lý AI' });
const log = () => screen.getByRole('log', { name: /Tin nhắn/ });
const openPanel = async () => {
  renderAt();
  fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý AI' }));
  await waitFor(() => expect(input().disabled).toBe(false));
};

describe('FloatingChatBox', () => {
  it('mở/đóng được, giữ trạng thái mở khi chuyển trang và không hiển thị chuyển nhân viên', async () => {
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý AI' }));
    expect(await screen.findByText(/Mình là trợ lý AI của quán/)).toBeTruthy();

    await current.router.navigate('/home');
    await waitFor(() => expect(current.router.state.location.pathname).toBe('/home'));
    expect(panel()).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Chuyển nhân viên/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Đóng trợ lý AI' }));
    expect(panel()).toBeNull();
  });

  it('gửi chat qua AI Gateway với branch id và giữ lịch sử hội thoại làm context', async () => {
    const calls: Array<{
      body: { message: string; history: Array<{ role: string; content: string }> };
      branchId: string | null;
    }> = [];
    server.use(http.post(url('/chat'), async ({ request }) => {
      const body = await request.json() as { message: string; history: Array<{ role: string; content: string }> };
      calls.push({ body, branchId: request.headers.get('X-Branch-Id') });
      return HttpResponse.json({ answer: `AI: ${body.message}`, sources: [] });
    }));

    await openPanel();
    type('Gợi ý món ít đắng');
    pressEnter();
    expect(await within(log()).findByText('AI: Gợi ý món ít đắng')).toBeTruthy();

    type('Còn món nào không caffeine?');
    pressEnter();
    expect(await within(log()).findByText('AI: Còn món nào không caffeine?')).toBeTruthy();

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      body: { message: 'Gợi ý món ít đắng', history: [] },
      branchId: '1',
    });
    expect(calls[1].body.history).toEqual([
      { role: 'user', content: 'Gợi ý món ít đắng' },
      { role: 'assistant', content: 'AI: Gợi ý món ít đắng' },
    ]);
  });

  it('fallback sang AI Service trực tiếp khi AI Gateway trả 404', async () => {
    server.use(
      http.post(url('/chat'), () => HttpResponse.json({ message: 'Not Found' }, { status: 404 }), { once: true }),
      http.post(/\/ai-service\/chat$/, async ({ request }) => {
        const body = await request.json() as { message: string };
        return HttpResponse.json({ answer: `Direct AI: ${body.message}`, sources: [] });
      }),
    );

    await openPanel();
    type('Xin chào');
    pressEnter();
    expect(await within(log()).findByText('Direct AI: Xin chào')).toBeTruthy();
  });

  it('fallback sang AI Service trực tiếp khi Intelligence route trả 403', async () => {
    server.use(
      http.post(url('/chat'), () => HttpResponse.json({ message: 'Forbidden' }, { status: 403 }), { once: true }),
      http.post(/\/ai-service\/chat$/, () => HttpResponse.json({ answer: 'AI trực tiếp đã trả lời', sources: [] })),
    );

    await openPanel();
    type('Xin chào');
    pressEnter();
    expect(await within(log()).findByText('AI trực tiếp đã trả lời')).toBeTruthy();
  });

  it('đóng/mở panel trong cùng phiên vẫn giữ tin nhắn đã tải', async () => {
    let calls = 0;
    server.use(http.post(url('/chat'), async ({ request }) => {
      calls += 1;
      const body = await request.json() as { message: string };
      return HttpResponse.json({ answer: `AI: ${body.message}`, sources: [] });
    }));
    await openPanel();
    type('Xin chào');
    pressEnter();
    expect(await within(log()).findByText('AI: Xin chào')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Đóng trợ lý AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý AI' }));
    expect(await within(log()).findByText('Xin chào')).toBeTruthy();
    expect(calls).toBe(1);
  });

  it('gửi lỗi thì bỏ tin nhắn tạm, thử lại gọi lại AI và hiển thị câu trả lời', async () => {
    server.use(
      http.post(url('/chat'), () => HttpResponse.json({ message: 'AI tạm thời bận' }, { status: 503 }), { once: true }),
    );
    await openPanel();
    type('Gợi ý đồ uống');
    pressEnter();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Không gửi được tin nhắn');
    expect(within(log()).queryByText('Gợi ý đồ uống')).toBeNull();

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await within(log()).findByText(/món bạn có thể thích/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('khách vãng lai không cần đăng nhập; tài khoản đăng nhập được gửi kèm token tự động', async () => {
    const authorizations: Array<string | null> = [];
    server.use(http.post(url('/chat'), async ({ request }) => {
      authorizations.push(request.headers.get('Authorization'));
      return HttpResponse.json({ answer: 'Đã nhận câu hỏi.', sources: [] });
    }));
    loginAs('Customer', { id: 'u-42' });
    await openPanel();
    type('Xin chào');
    pressEnter();
    await within(log()).findByText('Đã nhận câu hỏi.');
    expect(authorizations[0]).toMatch(/^Bearer /);
  });
});
