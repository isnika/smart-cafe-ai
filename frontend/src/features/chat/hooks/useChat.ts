import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { DINE_IN_BRANCH_ID } from '@/features/dine-in/config';
import { useDineInCartStore } from '@/features/dine-in/store';
import { useOnlineCartStore } from '@/features/online-order/store';
import { intelligenceApi, isApiError } from '@/shared/api';
import type { ChatMessage, ChatReply, ChatSession, SendChatMessageInput } from '@/shared/types';
import { getGuestKey } from '../guest-key';

const sessionKey = (owner: string, branchId: number) => ['chat', 'session', owner, branchId] as const;
const messagesKey = (owner: string, branchId: number, sessionId: number | undefined) =>
  ['chat', 'messages', owner, branchId, sessionId ?? 'pending'] as const;
const storedSessionKey = (owner: string, branchId: number) => `smartcafe.chat.session.${owner}.${branchId}`;

function readStoredSessionId(owner: string, branchId: number): number | undefined {
  try {
    const value = Number(localStorage.getItem(storedSessionKey(owner, branchId)));
    return Number.isInteger(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function rememberSession(owner: string, branchId: number, session: ChatSession): void {
  try {
    localStorage.setItem(storedSessionKey(owner, branchId), String(session.id));
  } catch {
    /* private mode/quota: the query cache still keeps this tab alive */
  }
}

function newClientMessageId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

type SendVariables = SendChatMessageInput & { sessionId: number };

/**
 * Chat state is server-owned. The browser stores only the current session id;
 * history is loaded from Chat_Messages and never used as an authority.
 */
export function useChat(open: boolean) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const resolvingUser = useAuthStore((s) => s.accessToken !== null && s.user === null && s.status === 'booting');
  const dineInBranchId = useDineInCartStore((s) => s.branchId);
  const onlineBranchId = useOnlineCartStore((s) => s.branchId);
  const authBranchId = useAuthStore((s) => s.branchId);
  const branchId = dineInBranchId ?? onlineBranchId ?? authBranchId ?? DINE_IN_BRANCH_ID;
  const guestKey = user ? undefined : getGuestKey();
  const owner = user?.id ?? guestKey ?? 'guest';
  const currentSessionKey = sessionKey(owner, branchId);

  const session = useQuery({
    queryKey: currentSessionKey,
    enabled: open && !resolvingUser,
    queryFn: async () => {
      const input = {
        // Kept only for old clients/mocks. The backend derives the real owner from JWT.
        userId: user?.id,
        guestKey,
        branchId,
      };
      const savedId = readStoredSessionId(owner, branchId);
      if (savedId) {
        try {
          return await intelligenceApi.createChatSession({ ...input, sessionId: savedId });
        } catch (error) {
          // A closed/deleted/stale local pointer must not prevent creating a valid session.
          if (!isApiError(error) || ![400, 404, 409].includes(error.status)) throw error;
        }
      }
      return intelligenceApi.createChatSession(input);
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const currentSessionId = session.data?.id;
  const currentMessagesKey = messagesKey(owner, branchId, currentSessionId);
  const messages = useQuery({
    queryKey: currentMessagesKey,
    enabled: open && !resolvingUser && currentSessionId !== undefined,
    queryFn: () => intelligenceApi.listChatMessages(currentSessionId!, guestKey, branchId),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  useEffect(() => {
    if (session.data) rememberSession(owner, branchId, session.data);
  }, [branchId, owner, session.data]);

  const send = useMutation<ChatReply, unknown, SendVariables, { pendingId: number }>({
    mutationFn: ({ sessionId, content, clientMessageId }) =>
      intelligenceApi.sendChatMessage(sessionId, { content, clientMessageId }, guestKey, branchId),
    onMutate: async ({ sessionId, content }) => {
      await qc.cancelQueries({ queryKey: messagesKey(owner, branchId, sessionId) });
      const pending: ChatMessage = {
        id: -Date.now(),
        sessionId,
        senderRole: 'Customer',
        content,
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<ChatMessage[]>(messagesKey(owner, branchId, sessionId), (old = []) => [...old, pending]);
      return { pendingId: pending.id };
    },
    onSuccess: (reply, _variables, context) => {
      const key = messagesKey(owner, branchId, reply.session.id);
      qc.setQueryData<ChatMessage[]>(key, (old = []) => {
        const withoutPending = old.filter((message) => message.id !== context.pendingId);
        const existingIds = new Set(withoutPending.map((message) => message.id));
        return [...withoutPending, ...reply.messages.filter((message) => !existingIds.has(message.id))];
      });
      qc.setQueryData(currentSessionKey, reply.session);
      rememberSession(owner, branchId, reply.session);
    },
    onError: (_error, variables, context) => {
      qc.setQueryData<ChatMessage[]>(messagesKey(owner, branchId, variables.sessionId), (old = []) =>
        old.filter((message) => message.id !== context?.pendingId),
      );
    },
  });

  const createNew = useMutation({
    mutationFn: () => intelligenceApi.createChatSession({
      userId: user?.id,
      guestKey,
      branchId,
      newSession: true,
    }),
    onSuccess: (nextSession) => {
      qc.setQueryData(currentSessionKey, nextSession);
      qc.removeQueries({ queryKey: messagesKey(owner, branchId, nextSession.id) });
      rememberSession(owner, branchId, nextSession);
    },
  });

  const sendMessage = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || currentSessionId === undefined || send.isPending || session.data?.status !== 'Active') return;
    send.mutate({ sessionId: currentSessionId, content: trimmed, clientMessageId: newClientMessageId() });
  };

  const reload = () => {
    void session.refetch();
    void messages.refetch();
  };

  return {
    session: session.data,
    messages: messages.data ?? [],
    handler: session.data?.status === 'Waiting_Staff'
      ? 'waiting_staff' as const
      : session.data?.status === 'Handed_Off'
        ? 'staff' as const
        : session.data?.status === 'Closed'
          ? 'closed' as const
          : 'ai' as const,
    ready: session.data !== undefined && messages.data !== undefined && !resolvingUser,
    loading: open && (session.isPending || (session.data !== undefined && messages.isPending)),
    loadError: session.isError || messages.isError,
    reload,
    send: sendMessage,
    newChat: () => {
      send.reset();
      createNew.mutate();
    },
    creatingNew: createNew.isPending,
    sending: send.isPending,
    typing: send.isPending,
    sendError: send.isError && send.variables?.sessionId === currentSessionId,
    retrySend: () => {
      const variables = send.variables;
      if (variables && variables.sessionId === currentSessionId) send.mutate(variables);
    },
  };
}
