import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { DINE_IN_BRANCH_ID } from '@/features/dine-in/config';
import { intelligenceApi } from '@/shared/api';
import type { ChatMessage, ChatSession } from '@/shared/types';
import { getGuestKey } from '../guest-key';
import { handlerOf } from '../model';

const sessionKey = (owner: string) => ['chat', 'session', owner] as const;
const messagesKey = (sessionId: number | undefined) => ['chat', 'messages', sessionId] as const;

/**
 * Phiên chat của người đang xem: đã đăng nhập → theo `userId`, chưa → theo `guestKey` (không cần token).
 * Chỉ gọi API khi panel mở lần đầu; đóng/mở lại dùng cache nên không mất lịch sử, F5 thì tạo lại phiên
 * (server trả lại phiên đang mở của cùng chủ nên vẫn thấy lịch sử).
 */
export function useChat(open: boolean) {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  // Có token nhưng chưa biết ai (đang /me): chờ, tránh tạo phiên khách rồi đổi sang phiên user.
  const resolvingUser = useAuthStore((s) => s.accessToken !== null && s.user === null && s.status === 'booting');
  const owner = userId ?? 'guest';

  const session = useQuery({
    queryKey: sessionKey(owner),
    enabled: open && !resolvingUser,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: () =>
      intelligenceApi.createChatSession(userId ? { userId, branchId: DINE_IN_BRANCH_ID } : { guestKey: getGuestKey(), branchId: DINE_IN_BRANCH_ID }),
  });
  const sessionId = session.data?.id;

  const messages = useQuery({
    queryKey: messagesKey(sessionId),
    enabled: sessionId !== undefined,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: () => intelligenceApi.listChatMessages(sessionId!),
  });

  const send = useMutation({
    mutationFn: (content: string) => intelligenceApi.sendChatMessage(sessionId!, { content }),
    onMutate: async (content) => {
      await qc.cancelQueries({ queryKey: messagesKey(sessionId) });
      const pending: ChatMessage = {
        id: -Date.now(), sessionId: sessionId!, senderRole: 'Customer', content, createdAt: new Date().toISOString(),
      };
      qc.setQueryData<ChatMessage[]>(messagesKey(sessionId), (old = []) => [...old, pending]);
      return { pendingId: pending.id };
    },
    onSuccess: (reply, _content, ctx) => {
      qc.setQueryData<ChatMessage[]>(messagesKey(sessionId), (old = []) => [...old.filter((m) => m.id !== ctx.pendingId), ...reply.messages]);
      qc.setQueryData<ChatSession>(sessionKey(owner), reply.session);
    },
    onError: (_err, _content, ctx) => {
      qc.setQueryData<ChatMessage[]>(messagesKey(sessionId), (old = []) => old.filter((m) => m.id !== ctx?.pendingId));
    },
  });

  const handOff = useMutation({
    mutationFn: () => intelligenceApi.handOffChat(sessionId!),
    onSuccess: (next) => qc.setQueryData<ChatSession>(sessionKey(owner), next),
  });

  const handler = handlerOf(session.data?.status);
  const ready = session.data !== undefined && messages.data !== undefined;

  return {
    session: session.data,
    messages: messages.data ?? [],
    handler,
    ready,
    loading: open && !ready && !session.isError && !messages.isError,
    loadError: session.isError || messages.isError,
    reload: () => {
      if (session.isError) void session.refetch();
      else void messages.refetch();
    },
    send: (content: string) => send.mutate(content),
    sending: send.isPending,
    /** "AI đang trả lời…": chỉ khi phiên còn do AI xử lý. */
    typing: send.isPending && handler === 'ai',
    sendError: send.isError,
    retrySend: () => send.variables !== undefined && send.mutate(send.variables),
    handOff: () => handOff.mutate(),
    handingOff: handOff.isPending,
    handOffError: handOff.isError,
  };
}
