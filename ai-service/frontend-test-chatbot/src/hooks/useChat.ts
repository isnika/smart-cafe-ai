import { useCallback, useEffect, useMemo, useState } from 'react'
import { TEST_CASES } from '../data/testCases'
import { buildHistory } from '../services/chatHistory'
import {
  ChatbotApiError,
  joinUrl,
  sendChatMessage,
  testBackendConnection,
} from '../services/chatbotApi'
import type {
  ActiveTestRun,
  ApiConfig,
  ChatRequest,
  ChatTestCase,
  ChatUiMessage,
  ConnectionState,
  Conversation,
  DebugExchange,
  TestEvaluation,
} from '../types/chat'

const CONVERSATIONS_KEY = 'smart-cafe-chat-tester:conversations:v1'
// v2 switches the browser to the same-origin /api proxy. Keeping the version
// in the key prevents an old localhost/tunnel URL from overriding the fix.
const CONFIG_KEY = 'smart-cafe-chat-tester:api-config:v2'
const EVALUATIONS_KEY = 'smart-cafe-chat-tester:evaluations:v1'

const configuredTimeout = Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS)
const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
  endpoint: import.meta.env.VITE_CHAT_ENDPOINT || '/chat',
  timeoutMs: Number.isFinite(configuredTimeout) ? configuredTimeout : 45_000,
  debugMode: true,
}

function id(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createConversation(): Conversation {
  const now = new Date().toISOString()
  return {
    id: id(),
    title: 'Cuộc trò chuyện mới',
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function persist(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode/quota errors must not break the tester itself.
  }
}

function conversationTitle(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim()
  return compact.length > 38 ? `${compact.slice(0, 38)}…` : compact
}

export function useChat() {
  const initialConversation = useMemo(createConversation, [])
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const stored = readStorage<Conversation[]>(CONVERSATIONS_KEY, [])
    return stored.length ? stored : [initialConversation]
  })
  const [currentConversationId, setCurrentConversationId] = useState(
    () => conversations[0]?.id ?? initialConversation.id,
  )
  const [config, setConfig] = useState<ApiConfig>(() =>
    readStorage<ApiConfig>(CONFIG_KEY, DEFAULT_CONFIG),
  )
  const [evaluations, setEvaluations] = useState<Record<string, TestEvaluation>>(() =>
    readStorage<Record<string, TestEvaluation>>(EVALUATIONS_KEY, {}),
  )
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [lastDebug, setLastDebug] = useState<DebugExchange | null>(null)
  const [connection, setConnection] = useState<ConnectionState>({
    status: 'idle',
    message: 'Chưa kiểm tra kết nối',
  })
  const [activeTestRun, setActiveTestRun] = useState<ActiveTestRun | null>(null)

  const currentConversation =
    conversations.find((conversation) => conversation.id === currentConversationId) ??
    conversations[0]

  useEffect(() => persist(CONVERSATIONS_KEY, conversations), [conversations])
  useEffect(() => persist(CONFIG_KEY, config), [config])
  useEffect(() => persist(EVALUATIONS_KEY, evaluations), [evaluations])

  const newChat = useCallback(() => {
    const conversation = createConversation()
    setConversations((current) => [conversation, ...current])
    setCurrentConversationId(conversation.id)
    setDraft('')
    setActiveTestRun(null)
    setLastDebug(null)
  }, [])

  const selectConversation = useCallback((conversationId: string) => {
    setCurrentConversationId(conversationId)
    setDraft('')
    setActiveTestRun(null)
  }, [])

  const deleteConversation = useCallback((conversationId: string) => {
    setConversations((current) => {
      const remaining = current.filter((conversation) => conversation.id !== conversationId)
      if (remaining.length) {
        if (conversationId === currentConversationId) setCurrentConversationId(remaining[0].id)
        return remaining
      }
      const replacement = createConversation()
      setCurrentConversationId(replacement.id)
      return [replacement]
    })
  }, [currentConversationId])

  const clearAllConversations = useCallback(() => {
    const replacement = createConversation()
    setConversations([replacement])
    setCurrentConversationId(replacement.id)
    setDraft('')
    setActiveTestRun(null)
    setLastDebug(null)
  }, [])

  const send = useCallback(async (content?: string, retryMessageId?: string) => {
    if (sending || !currentConversation) return
    const requestedContent = retryMessageId
      ? currentConversation.messages.find((message) => message.id === retryMessageId)?.content ?? ''
      : content ?? draft
    const message = requestedContent.trim()
    if (!message || message.length > 2000) return

    const userMessageId = retryMessageId ?? id()
    const history = buildHistory(currentConversation.messages, retryMessageId)
    const request: ChatRequest = { message, history }
    const now = new Date().toISOString()

    setConversations((current) => current.map((conversation) => {
      if (conversation.id !== currentConversation.id) return conversation
      if (retryMessageId) {
        return {
          ...conversation,
          updatedAt: now,
          messages: conversation.messages.map((item) =>
            item.id === retryMessageId
              ? { ...item, status: 'pending', error: undefined, metrics: undefined }
              : item,
          ),
        }
      }
      const userMessage: ChatUiMessage = {
        id: userMessageId,
        role: 'user',
        content: message,
        status: 'pending',
        createdAt: now,
      }
      return {
        ...conversation,
        title: conversation.messages.length ? conversation.title : conversationTitle(message),
        updatedAt: now,
        messages: [...conversation.messages, userMessage],
      }
    }))
    if (!retryMessageId) setDraft('')
    setSending(true)

    try {
      const result = await sendChatMessage(config, request)
      const assistantMessage: ChatUiMessage = {
        id: id(),
        role: 'assistant',
        content: result.data.answer,
        status: 'success',
        createdAt: new Date().toISOString(),
        sources: result.data.sources,
        metrics: result.metrics,
      }
      setConversations((current) => current.map((conversation) =>
        conversation.id === currentConversation.id
          ? {
              ...conversation,
              updatedAt: assistantMessage.createdAt,
              messages: [
                ...conversation.messages.map((item) =>
                  item.id === userMessageId ? { ...item, status: 'success' as const } : item,
                ),
                assistantMessage,
              ],
            }
          : conversation,
      ))
      setLastDebug({
        id: id(),
        timestamp: new Date().toISOString(),
        endpoint: joinUrl(config.baseUrl, config.endpoint),
        method: 'POST',
        request,
        response: result.rawResponse,
        statusCode: result.metrics.statusCode,
        responseTimeMs: result.metrics.durationMs,
        responseBytes: result.metrics.responseBytes,
        historyCount: history.length,
        tokenUsage: result.metrics.tokenUsage,
      })

      if (activeTestRun) {
        const testCase = TEST_CASES.find((item) => item.id === activeTestRun.testCaseId)
        const nextStep = activeTestRun.stepIndex + 1
        if (testCase && nextStep < testCase.steps.length) {
          setActiveTestRun({ testCaseId: testCase.id, stepIndex: nextStep })
          setDraft(testCase.steps[nextStep])
        }
      }
    } catch (error) {
      const apiError = error instanceof ChatbotApiError ? error : null
      const errorMessage = error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định.'
      setConversations((current) => current.map((conversation) =>
        conversation.id === currentConversation.id
          ? {
              ...conversation,
              updatedAt: new Date().toISOString(),
              messages: conversation.messages.map((item) =>
                item.id === userMessageId
                  ? { ...item, status: 'error' as const, error: errorMessage, metrics: apiError?.metrics }
                  : item,
              ),
            }
          : conversation,
      ))
      setLastDebug({
        id: id(),
        timestamp: new Date().toISOString(),
        endpoint: joinUrl(config.baseUrl, config.endpoint),
        method: 'POST',
        request,
        response: apiError?.response,
        statusCode: apiError?.statusCode ?? apiError?.metrics.statusCode,
        responseTimeMs: apiError?.metrics.durationMs ?? 0,
        responseBytes: apiError?.metrics.responseBytes,
        errorMessage,
        historyCount: history.length,
        tokenUsage: apiError?.metrics.tokenUsage,
      })
    } finally {
      setSending(false)
    }
  }, [activeTestRun, config, currentConversation, draft, sending])

  const selectTestCase = useCallback((testCase: ChatTestCase) => {
    let targetId = currentConversationId
    if (currentConversation?.messages.length) {
      const conversation = createConversation()
      targetId = conversation.id
      setConversations((current) => [conversation, ...current])
      setCurrentConversationId(targetId)
    }
    setActiveTestRun({ testCaseId: testCase.id, stepIndex: 0 })
    setDraft(testCase.steps[0])
  }, [currentConversation?.messages.length, currentConversationId])

  const evaluateTest = useCallback((testCaseId: string, evaluation: TestEvaluation) => {
    setEvaluations((current) => ({ ...current, [testCaseId]: evaluation }))
  }, [])

  const checkConnection = useCallback(async () => {
    setConnection({ status: 'checking', message: 'Đang gọi GET /health…' })
    try {
      const result = await testBackendConnection(config)
      setConnection({
        status: result.online ? 'online' : 'offline',
        message: result.online ? `Backend online · HTTP ${result.statusCode}` : `HTTP ${result.statusCode}`,
        checkedAt: new Date().toISOString(),
        responseTimeMs: result.responseTimeMs,
      })
    } catch (error) {
      setConnection({
        status: 'offline',
        message: error instanceof Error ? error.message : 'Không kết nối được Backend.',
        checkedAt: new Date().toISOString(),
      })
    }
  }, [config])

  return {
    conversations,
    currentConversation,
    currentConversationId,
    config,
    setConfig,
    draft,
    setDraft,
    sending,
    lastDebug,
    connection,
    activeTestRun,
    evaluations,
    newChat,
    selectConversation,
    deleteConversation,
    clearAllConversations,
    sendMessage: () => send(),
    retryMessage: (messageId: string) => send(undefined, messageId),
    selectTestCase,
    evaluateTest,
    checkConnection,
  }
}
