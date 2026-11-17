import type { ChatMessage, ChatProductCard, ChatSessionStatus } from '@/shared/types';

export const MAX_MESSAGE_LENGTH = 1000;

/** Câu hỏi mẫu ở trạng thái rỗng. */
export const SUGGESTED_PROMPTS = ['Gợi ý đồ uống ít đắng', 'Đồ uống không caffeine', 'Món ngọt, béo nào ngon?'] as const;

/** Thẻ món AI gắn trong `metadata.products` — lọc phòng thủ vì metadata là JSON tự do. */
export function productCardsOf(message: ChatMessage): ChatProductCard[] {
  const raw = message.metadata?.products;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is ChatProductCard =>
      typeof p === 'object' && p !== null && typeof (p as ChatProductCard).productId === 'number' && typeof (p as ChatProductCard).name === 'string',
  );
}

/** Ai đang trả lời phiên này. */
export type ChatHandler = 'ai' | 'waiting_staff' | 'staff' | 'closed';

export const handlerOf = (status: ChatSessionStatus | undefined): ChatHandler => {
  switch (status) {
    case 'Waiting_Staff':
      return 'waiting_staff';
    case 'Handed_Off':
      return 'staff';
    case 'Closed':
      return 'closed';
    default:
      return 'ai';
  }
};

export const HANDLER_NOTICE: Record<Exclude<ChatHandler, 'ai'>, string> = {
  waiting_staff: 'Đã chuyển cho nhân viên — đang chờ nhân viên tiếp nhận. Trợ lý AI sẽ không tự trả lời nữa.',
  staff: 'Nhân viên đã tiếp nhận cuộc trò chuyện.',
  closed: 'Cuộc trò chuyện đã kết thúc.',
};

/** Tin tạm hiển thị ngay khi khách bấm gửi (id âm = chưa có trên server). */
export const isPendingMessage = (m: ChatMessage): boolean => m.id < 0;
