import type { ChatHistoryMessage, ChatUiMessage } from '../types/chat'

const MAX_BACKEND_HISTORY = 30

export function buildHistory(
  messages: ChatUiMessage[],
  beforeMessageId?: string,
): ChatHistoryMessage[] {
  const endIndex = beforeMessageId
    ? messages.findIndex((message) => message.id === beforeMessageId)
    : messages.length
  const candidates = messages.slice(0, endIndex >= 0 ? endIndex : messages.length)
  const successful = candidates
    .filter((message) => message.status === 'success' && message.content.trim())
    .map(({ role, content }) => ({ role, content: content.trim() }))
    .slice(-MAX_BACKEND_HISTORY)

  while (successful[0]?.role === 'assistant') {
    successful.shift()
  }
  return successful
}
