// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handlers } from '@/mocks/handlers';
import { chatMockConfig } from '@/mocks/handlers/chat';
import { intelligenceApi } from '@/shared/api';
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

let replyId = 1000;
const sessionReply = (sessionId: number, content: string, answer: string) => ({
  messages: [
    { id: ++replyId, sessionId, senderRole: 'Customer', content, createdAt: new Date().toISOString() },
    { id: ++replyId, sessionId, senderRole: 'AI', content: answer, metadata: null, createdAt: new Date().toISOString() },
  ],
  session: {
    id: sessionId, userId: null, guestKey: 'test-guest', staffUserId: null, branchId: 1,
    status: 'Active', handedOffAt: null, createdAt: new Date().toISOString(), closedAt: null,
  },
});

describe('FloatingChatBox', () => {
  it('mở/đóng được và giữ panel khi chuyển trang', async () => {
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

  it('gửi theo session, giữ session id và để backend sở hữu history', async () => {
    const calls: Array<{ body: { content: string; clientMessageId?: string; history?: unknown }; branchId: string | null }> = [];
    server.use(http.post(url('/chat/sessions/:id/messages'), async ({ request, params }) => {
      const body = await request.json() as { content: string; clientMessageId?: string; history?: unknown };
      calls.push({ body, branchId: request.headers.get('X-Branch-Id') });
      return HttpResponse.json(sessionReply(Number(params.id), body.content, `AI: ${body.content}`), { status: 201 });
    }));

    await openPanel();
    type('Gợi ý món ít đắng');
    pressEnter();
    expect(await within(log()).findByText('AI: Gợi ý món ít đắng')).toBeTruthy();

    type('Còn món nào không caffeine?');
    pressEnter();
    expect(await within(log()).findByText('AI: Còn món nào không caffeine?')).toBeTruthy();

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ body: { content: 'Gợi ý món ít đắng' }, branchId: '1' });
    expect(calls[0].body.history).toBeUndefined();
    expect(calls[0].body.clientMessageId).toEqual(expect.any(String));
    expect(calls[1].body.content).toBe('Còn món nào không caffeine?');
  });

  it('giữ fallback /chat legacy cho client cũ', async () => {
    server.use(
      http.post(url('/chat'), () => HttpResponse.json({ message: 'Not Found' }, { status: 404 }), { once: true }),
      http.post(/\/ai-service\/chat$/, async ({ request }) => {
        const body = await request.json() as { message: string };
        return HttpResponse.json({ answer: `Direct AI: ${body.message}`, sources: [] });
      }),
    );
    await expect(intelligenceApi.completeChat({ message: 'Xin chào', history: [] }, 1)).resolves.toMatchObject({ answer: 'Direct AI: Xin chào' });
  });

  it('đóng/mở panel trong cùng phiên vẫn tải lại history đã lưu', async () => {
    let calls = 0;
    server.use(http.post(url('/chat/sessions/:id/messages'), async ({ request, params }) => {
      calls += 1;
      const body = await request.json() as { content: string };
      return HttpResponse.json(sessionReply(Number(params.id), body.content, `AI: ${body.content}`), { status: 201 });
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

  it('gửi lỗi thì bỏ tin nhắn tạm và retry cùng client message id', async () => {
    const ids: string[] = [];
    server.use(
      http.post(url('/chat/sessions/:id/messages'), async ({ request }) => {
        const body = await request.json() as { clientMessageId: string; content: string };
        ids.push(body.clientMessageId);
        if (ids.length === 1) return HttpResponse.json({ message: 'AI tạm thời bận' }, { status: 503 });
        return HttpResponse.json(sessionReply(1, body.content, 'Mình đã nhận lại câu hỏi.'), { status: 201 });
      }),
    );
    await openPanel();
    type('Gợi ý đồ uống');
    pressEnter();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Không gửi được tin nhắn');
    expect(within(log()).queryByText('Gợi ý đồ uống')).toBeNull();

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await within(log()).findByText('Mình đã nhận lại câu hỏi.')).toBeTruthy();
    expect(ids[0]).toBe(ids[1]);
  });

  it('khách vãng lai không cần đăng nhập, tài khoản gửi token khi gửi theo session', async () => {
    const authorizations: Array<string | null> = [];
    server.use(http.post(url('/chat/sessions/:id/messages'), async ({ request, params }) => {
      authorizations.push(request.headers.get('Authorization'));
      const body = await request.json() as { content: string };
      return HttpResponse.json(sessionReply(Number(params.id), body.content, 'Đã nhận câu hỏi.'), { status: 201 });
    }));
    loginAs('Customer', { id: 'u-42' });
    await openPanel();
    type('Xin chào');
    pressEnter();
    await within(log()).findByText('Đã nhận câu hỏi.');
    expect(authorizations[0]).toMatch(/^Bearer /);
  });
});
