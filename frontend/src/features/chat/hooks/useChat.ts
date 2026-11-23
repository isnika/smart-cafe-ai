import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { DINE_IN_BRANCH_ID } from '@/features/dine-in/config';
import { useDineInCartStore } from '@/features/dine-in/store';
import { useOnlineCartStore } from '@/features/online-order/store';
import { intelligenceApi } from '@/shared/api';
import type { ChatMessage } from '@/shared/types';

const messagesKey = (owner: string) => ['chat', 'messages', owner] as const;

/** Chat AI dùng API stateless; lịch sử được giữ trong cache của tab để gửi làm context. */
export function useChat(open: boolean) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const resolvingUser = useAuthStore((s) => s.accessToken !== null && s.user === null && s.status === 'booting');
  const dineInBranchId = useDineInCartStore((s) => s.branchId);
  const onlineBranchId = useOnlineCartStore((s) => s.branchId);
  const branchId = dineInBranchId ?? onlineBranchId ?? DINE_IN_BRANCH_ID;
  const owner = user?.id ?? 'guest';
  const key = [...messagesKey(owner), branchId] as const;

  const messages = useQuery({
    queryKey: key,
    enabled: open && !resolvingUser,
    queryFn: async () => [] as ChatMessage[],
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const send = useMutation({
    mutationFn: ({ content, history }: {
      content: string;
      history: Array<{ role: 'user' | 'assistant'; content: string }>;
    }) => intelligenceApi.completeChat({ message: content, history }, branchId),
    onMutate: async ({ content }) => {
      await qc.cancelQueries({ queryKey: key });
      const pending: ChatMessage = {
        id: -Date.now(),
        sessionId: 0,
        senderRole: 'Customer',
        content,
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<ChatMessage[]>(key, (old = []) => [...old, pending]);
      return { pendingId: pending.id };
    },
    onSuccess: (reply, variables, context) => {
      const messageId = Date.now();
      const customerMessage: ChatMessage = {
        id: messageId,
        sessionId: 0,
        senderRole: 'Customer',
        content: variables.content,
        createdAt: new Date().toISOString(),
      };
      const answer: ChatMessage = {
        id: messageId + 1,
        sessionId: 0,
        senderRole: 'AI',
        content: reply.answer,
        metadata: { sources: reply.sources },
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<ChatMessage[]>(key, (old = []) => [
        ...old.filter((message) => message.id !== context.pendingId),
        customerMessage,
        answer,
      ]);
    },
    onError: (_error, _variables, context) => {
      qc.setQueryData<ChatMessage[]>(key, (old = []) =>
        old.filter((message) => message.id !== context?.pendingId),
      );
    },
  });

  const sendMessage = (content: string) => {
    const history = (qc.getQueryData<ChatMessage[]>(key) ?? [])
      .filter((message) => message.id > 0 && (message.senderRole === 'Customer' || message.senderRole === 'AI'))
      .slice(-30)
      .map((message) => ({
        role: message.senderRole === 'Customer' ? 'user' as const : 'assistant' as const,
        content: message.content,
      }));
    send.mutate({ content, history });
  };

  return {
    messages: messages.data ?? [],
    handler: 'ai' as const,
    ready: messages.data !== undefined && !resolvingUser,
    loading: open && !messages.data && !messages.isError,
    loadError: messages.isError,
    reload: () => void messages.refetch(),
    send: sendMessage,
    sending: send.isPending,
    typing: send.isPending,
    sendError: send.isError,
    retrySend: () => send.variables !== undefined && send.mutate(send.variables),
  };
}
