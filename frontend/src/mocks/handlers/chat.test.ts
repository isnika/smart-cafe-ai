import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureHttp, intelligenceApi, isApiError } from '@/shared/api';
import type { ChatProductCard } from '@/shared/types';
import { db, resetDb } from '../db';
import { mockConfig, url } from '../utils';
import { chatMockConfig } from './chat';
import { handlers } from './index';

const server = setupServer(...handlers);
beforeAll(() => {
  server.listen();
  configureHttp({ getToken: () => null });
});
afterAll(() => server.close());
beforeEach(() => {
  resetDb();
  mockConfig.latencyMs = 0;
  chatMockConfig.replyDelayMs = { min: 0, max: 0 };
});
afterEach(() => server.resetHandlers());

const productsOf = (metadata: Record<string, unknown> | null | undefined) => (metadata?.products ?? []) as ChatProductCard[];

describe('POST /intelligence/chat/sessions', () => {
  it('khách vãng lai tạo phiên bằng guestKey (không cần token) → 201, Active', async () => {
    const session = await intelligenceApi.createChatSession({ guestKey: 'guest-1' });
    expect(session).toMatchObject({ status: 'Active', userId: null, guestKey: 'guest-1' });
    expect(session.id).toBeGreaterThan(0);
  });

  it('người đã đăng nhập tạo phiên bằng userId', async () => {
    const session = await intelligenceApi.createChatSession({ userId: 'user-1' });
    expect(session).toMatchObject({ status: 'Active', userId: 'user-1', guestKey: null });
  });

  it('cùng chủ phiên → trả lại phiên đang mở (mở lại panel vẫn thấy lịch sử)', async () => {
    const a = await intelligenceApi.createChatSession({ guestKey: 'guest-1' });
    const b = await intelligenceApi.createChatSession({ guestKey: 'guest-1' });
    const other = await intelligenceApi.createChatSession({ guestKey: 'guest-2' });
    expect(b.id).toBe(a.id);
    expect(other.id).not.toBe(a.id);
    expect(db.chatSessions).toHaveLength(2);
  });

  it('thiếu cả userId lẫn guestKey → 400', async () => {
    const err = await intelligenceApi.createChatSession({}).catch((e: unknown) => e);
    expect(isApiError(err) && err.status).toBe(400);
  });
});

describe('POST/GET /intelligence/chat/sessions/:id/messages', () => {
  it('"gợi ý đồ uống ít đắng" → tin khách + tin AI kèm 2–3 thẻ món từ catalog; GET trả đúng lịch sử', async () => {
    const session = await intelligenceApi.createChatSession({ guestKey: 'g' });
    const reply = await intelligenceApi.sendChatMessage(session.id, { content: 'gợi ý đồ uống ít đắng' });

    expect(reply.messages.map((m) => m.senderRole)).toEqual(['Customer', 'AI']);
    expect(reply.messages[0]!.content).toBe('gợi ý đồ uống ít đắng');
    const cards = productsOf(reply.messages[1]!.metadata);
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(cards.length).toBeLessThanOrEqual(3);
    for (const card of cards) {
      const product = db.products.find((s) => s.product.id === card.productId)?.product;
      expect(product?.name).toBe(card.name); // thẻ thật của catalog
      expect(card.price).toBeGreaterThan(0);
    }

    const history = await intelligenceApi.listChatMessages(session.id);
    expect(history.map((m) => m.id)).toEqual(reply.messages.map((m) => m.id));
  });

  it('câu không hiểu → trả lời mặc định, không có thẻ món', async () => {
    const session = await intelligenceApi.createChatSession({ guestKey: 'g' });
    const reply = await intelligenceApi.sendChatMessage(session.id, { content: 'asdf qwer' });
    expect(reply.messages).toHaveLength(2);
    expect(productsOf(reply.messages[1]!.metadata)).toEqual([]);
  });

  it('nội dung rỗng / quá dài → 400; phiên không tồn tại → 404', async () => {
    const session = await intelligenceApi.createChatSession({ guestKey: 'g' });
    const empty = await intelligenceApi.sendChatMessage(session.id, { content: '   ' }).catch((e: unknown) => e);
    const long = await intelligenceApi.sendChatMessage(session.id, { content: 'a'.repeat(1001) }).catch((e: unknown) => e);
    const missing = await intelligenceApi.sendChatMessage(999, { content: 'hi' }).catch((e: unknown) => e);
    expect(isApiError(empty) && empty.status).toBe(400);
    expect(isApiError(long) && long.status).toBe(400);
    expect(isApiError(missing) && missing.status).toBe(404);
    expect(db.chatMessages).toHaveLength(0); // lỗi thì không lưu gì
  });

  it('hai phiên không lẫn tin nhắn của nhau', async () => {
    const a = await intelligenceApi.createChatSession({ guestKey: 'a' });
    const b = await intelligenceApi.createChatSession({ guestKey: 'b' });
    await intelligenceApi.sendChatMessage(a.id, { content: 'xin chào' });
    expect(await intelligenceApi.listChatMessages(b.id)).toEqual([]);
    expect(await intelligenceApi.listChatMessages(a.id)).toHaveLength(2);
  });

  it('có độ trễ "AI đang trả lời" khi bật cấu hình', async () => {
    chatMockConfig.replyDelayMs = { min: 120, max: 120 };
    const session = await intelligenceApi.createChatSession({ guestKey: 'g' });
    const t0 = Date.now();
    await intelligenceApi.sendChatMessage(session.id, { content: 'xin chào' });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(100);
  });
});

describe('POST /intelligence/chat/sessions/:id/handoff', () => {
  it('chuyển nhân viên → Waiting_Staff + handedOffAt; gọi lại vẫn idempotent', async () => {
    const session = await intelligenceApi.createChatSession({ guestKey: 'g' });
    const first = await intelligenceApi.handOffChat(session.id);
    expect(first.status).toBe('Waiting_Staff');
    expect(first.handedOffAt).toBeTruthy();
    const again = await intelligenceApi.handOffChat(session.id);
    expect(again.handedOffAt).toBe(first.handedOffAt);
  });

  it('sau handoff: tin khách vẫn được lưu nhưng KHÔNG có lượt AI tự động', async () => {
    const session = await intelligenceApi.createChatSession({ guestKey: 'g' });
    await intelligenceApi.handOffChat(session.id);
    const reply = await intelligenceApi.sendChatMessage(session.id, { content: 'gợi ý đồ uống ít đắng' });
    expect(reply.messages.map((m) => m.senderRole)).toEqual(['Customer']);
    expect(reply.session.status).toBe('Waiting_Staff');
  });

  it('mở lại phiên sau handoff vẫn thấy trạng thái chờ nhân viên', async () => {
    const session = await intelligenceApi.createChatSession({ guestKey: 'g' });
    await intelligenceApi.handOffChat(session.id);
    const reopened = await intelligenceApi.createChatSession({ guestKey: 'g' });
    expect(reopened).toMatchObject({ id: session.id, status: 'Waiting_Staff' });
  });

  it('phiên đã đóng → 409; phiên không tồn tại → 404', async () => {
    const session = await intelligenceApi.createChatSession({ guestKey: 'g' });
    db.chatSessions[0]!.status = 'Closed';
    const closed = await intelligenceApi.handOffChat(session.id).catch((e: unknown) => e);
    const sendClosed = await intelligenceApi.sendChatMessage(session.id, { content: 'hi' }).catch((e: unknown) => e);
    const missing = await intelligenceApi.handOffChat(404).catch((e: unknown) => e);
    expect(isApiError(closed) && closed.status).toBe(409);
    expect(isApiError(sendClosed) && sendClosed.status).toBe(409);
    expect(isApiError(missing) && missing.status).toBe(404);
  });
});

describe('khớp URL của client', () => {
  it('endpoint nằm dưới /intelligence/chat/sessions', async () => {
    const res = await fetch(url('/intelligence/chat/sessions'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guestKey: 'raw' }),
    });
    expect(res.status).toBe(201);
  });
});
