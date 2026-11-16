import { describe, expect, it } from 'vitest'
import type { ChatUiMessage } from '../types/chat'
import { buildHistory } from './chatHistory'

function message(
  id: string,
  role: ChatUiMessage['role'],
  content: string,
  status: ChatUiMessage['status'] = 'success',
): ChatUiMessage {
  return { id, role, content, status, createdAt: '2026-01-01T00:00:00.000Z' }
}

describe('buildHistory', () => {
  it('keeps only successful user/assistant messages before the current message', () => {
    const messages = [
      message('u1', 'user', 'Xin chào'),
      message('a1', 'assistant', 'Xin chào bạn'),
      message('failed', 'user', 'Request lỗi', 'error'),
      message('current', 'user', 'Bao nhiêu tiền?', 'pending'),
    ]

    expect(buildHistory(messages, 'current')).toEqual([
      { role: 'user', content: 'Xin chào' },
      { role: 'assistant', content: 'Xin chào bạn' },
    ])
  })

  it('never repeats the current user message in history', () => {
    const messages = [
      message('u1', 'user', 'Có cà phê sữa không?'),
      message('a1', 'assistant', 'Có cà phê sữa đá.'),
      message('u2', 'user', 'Bao nhiêu tiền?', 'pending'),
    ]

    const history = buildHistory(messages, 'u2')
    expect(history).toHaveLength(2)
    expect(history.some((item) => item.content === 'Bao nhiêu tiền?')).toBe(false)
  })

  it('caps history at the Backend limit and does not start with assistant', () => {
    const messages = Array.from({ length: 40 }, (_, index) =>
      message(String(index), index % 2 === 0 ? 'user' : 'assistant', `message-${index}`),
    )
    const history = buildHistory(messages)
    expect(history.length).toBeLessThanOrEqual(30)
    expect(history[0]?.role).toBe('user')
    expect(history.at(-1)?.content).toBe('message-39')
  })
})
