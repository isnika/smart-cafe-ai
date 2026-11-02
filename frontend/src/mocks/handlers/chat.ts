import { http, HttpResponse, delay } from 'msw';
import type { ChatMessage, ChatReply, ChatSession, CreateChatSessionInput, SendChatMessageInput } from '@/shared/types';
import { buildAiReply, type ChatCatalogItem } from '../chat-ai';
import { BRANCH_ID, db, isSellable, nowNaive, toMenuProduct } from '../db';
import { seedCategories } from '../fixtures';
import { fail, guarded, readJson, url } from '../utils';

/** Chỉnh lúc runtime (hoặc đặt 0 trong test): khoảng độ trễ giả lập "AI đang trả lời". */
export const chatMockConfig = { replyDelayMs: { min: 600, max: 1200 } };

const MAX_CONTENT_LENGTH = 1000;
const AI_MODEL = 'mock-assistant-v1';

const randomDelay = () => {
  const { min, max } = chatMockConfig.replyDelayMs;
  return min + Math.random() * Math.max(0, max - min);
};

function findSession(id: unknown): ChatSession {
  const session = db.chatSessions.find((s) => s.id === Number(id));
  if (!session) fail(404, 'CHAT_SESSION_NOT_FOUND', `Không tìm thấy phiên chat ${String(id)}`);
  return session;
}

function pushMessage(sessionId: number, senderRole: ChatMessage['senderRole'], content: string, metadata?: Record<string, unknown>): ChatMessage {
  const message: ChatMessage = {
    id: ++db.seq.chatMessage, sessionId, senderRole, senderUserId: null, content, metadata: metadata ?? null, createdAt: nowNaive(),
  };
  db.chatMessages.push(message);
  return message;
}

/** Catalog thật của mock (cùng nguồn với GET /catalog/products): chỉ món Active còn bán ở chi nhánh. */
function sellableCatalog(branchId: number): ChatCatalogItem[] {
  const categoryName = new Map(seedCategories().map((c) => [c.id, c.name]));
  return db.products
    .filter((seed) => seed.product.status === 'Active' && seed.variants.some((v) => isSellable(branchId, seed, v)))
    .map((seed) => toMenuProduct(seed, branchId))
    .map((product) => ({ product, categoryName: categoryName.get(product.categoryId) }));
}

export const chatHandlers = [
  // POST /intelligence/chat/sessions   body: { userId? | guestKey?, branchId? }
  // Idempotent theo chủ phiên: còn phiên chưa đóng của cùng userId/guestKey thì trả lại phiên đó (200) để mở lại panel vẫn thấy lịch sử.
  http.post(
    url('/intelligence/chat/sessions'),
    guarded(async ({ request }) => {
      const body = await readJson<CreateChatSessionInput>(request);
      const userId = body.userId?.trim() || undefined;
      const guestKey = body.guestKey?.trim() || undefined;
      if (!userId && !guestKey) fail(400, 'VALIDATION_ERROR', 'Cần userId (đã đăng nhập) hoặc guestKey (khách vãng lai)');
      const branchId = body.branchId ?? BRANCH_ID;
      if (branchId !== BRANCH_ID) fail(404, 'BRANCH_NOT_FOUND', `Không có chi nhánh ${branchId}`);

      const existing = db.chatSessions.find(
        (s) => s.status !== 'Closed' && (userId ? s.userId === userId : !s.userId && s.guestKey === guestKey),
      );
      if (existing) return HttpResponse.json<ChatSession>(existing);

      const session: ChatSession = {
        id: ++db.seq.chatSession,
        userId: userId ?? null,
        guestKey: userId ? null : (guestKey ?? null),
        staffUserId: null,
        branchId,
        status: 'Active',
        handedOffAt: null,
        createdAt: nowNaive(),
        closedAt: null,
      };
      db.chatSessions.push(session);
      return HttpResponse.json<ChatSession>(session, { status: 201 });
    }),
  ),

  // GET /intelligence/chat/sessions/:id/messages  → lịch sử theo thứ tự thời gian
  http.get(
    url('/intelligence/chat/sessions/:id/messages'),
    guarded(({ params }) => {
      const session = findSession(params.id);
      return HttpResponse.json<ChatMessage[]>(db.chatMessages.filter((m) => m.sessionId === session.id).sort((a, b) => a.id - b.id));
    }),
  ),

  // POST /intelligence/chat/sessions/:id/messages   body: { content }
  // → { messages: [tin khách, (tin AI)], session }. Phiên đã chuyển nhân viên thì KHÔNG có lượt AI tự động.
  http.post(
    url('/intelligence/chat/sessions/:id/messages'),
    guarded(async ({ request, params }) => {
      const body = await readJson<Partial<SendChatMessageInput>>(request);
      const session = findSession(params.id);
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      if (!content) fail(400, 'VALIDATION_ERROR', 'Nội dung tin nhắn không được để trống');
      if (content.length > MAX_CONTENT_LENGTH) fail(400, 'VALIDATION_ERROR', `Tin nhắn tối đa ${MAX_CONTENT_LENGTH} ký tự`);
      if (session.status === 'Closed') fail(409, 'CHAT_SESSION_CLOSED', 'Phiên chat đã đóng');

      const messages: ChatMessage[] = [pushMessage(session.id, 'Customer', content)];
      if (session.status === 'Active') {
        await delay(randomDelay()); // "AI đang trả lời…"
        const reply = buildAiReply(content, sellableCatalog(session.branchId ?? BRANCH_ID));
        messages.push(
          pushMessage(session.id, 'AI', reply.content, { model: AI_MODEL, ...(reply.products.length > 0 ? { products: reply.products } : {}) }),
        );
      }
      return HttpResponse.json<ChatReply>({ messages, session }, { status: 201 });
    }),
  ),

  // POST /intelligence/chat/sessions/:id/handoff → ChatSession (Waiting_Staff). Gọi lại khi đã chuyển thì trả nguyên trạng.
  http.post(
    url('/intelligence/chat/sessions/:id/handoff'),
    guarded(({ params }) => {
      const session = findSession(params.id);
      if (session.status === 'Closed') fail(409, 'CHAT_SESSION_CLOSED', 'Phiên chat đã đóng');
      if (session.status === 'Active') {
        session.status = 'Waiting_Staff';
        session.handedOffAt = nowNaive();
      }
      return HttpResponse.json<ChatSession>(session);
    }),
  ),
];
