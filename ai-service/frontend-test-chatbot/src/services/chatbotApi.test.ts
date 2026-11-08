import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiConfig, ChatRequest } from '../types/chat'
import { ChatbotApiError, sendChatMessage } from './chatbotApi'

const config: ApiConfig = {
  baseUrl: 'http://127.0.0.1:8000/',
  endpoint: '/chat',
  timeoutMs: 1000,
  debugMode: true,
}

const request: ChatRequest = {
  message: 'Bao nhiêu tiền?',
  history: [
    { role: 'user', content: 'Có cà phê sữa không?' },
    { role: 'assistant', content: 'Có cà phê sữa đá.' },
  ],
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('sendChatMessage', () => {
  it('posts the exact FastAPI contract and preserves response sources', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answer: 'Cà phê sữa đá có giá tham khảo 29.000 VND.',
      sources: [{
        source: 'menu/coffee.md',
        category: 'menu',
        heading: 'Cà phê sữa đá',
        score: 0.91,
        content: 'Giá mẫu: 29.000 VND',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendChatMessage(config, request)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8000/chat')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual(request)
    expect(result.data.sources[0].heading).toBe('Cà phê sữa đá')
    expect(result.metrics.statusCode).toBe(200)
    expect(result.metrics.responseBytes).toBeGreaterThan(0)
  })

  it('surfaces FastAPI validation details for HTTP 422', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: [{ msg: 'String should have at least 1 character' }],
    }), { status: 422 })))

    await expect(sendChatMessage(config, request)).rejects.toMatchObject({
      name: 'ChatbotApiError',
      kind: 'http',
      statusCode: 422,
      message: 'String should have at least 1 character',
    })
  })

  it('rejects non-JSON and schema-invalid successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 200 })))
    await expect(sendChatMessage(config, request)).rejects.toMatchObject({ kind: 'invalid-json' })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ sources: [] }), { status: 200 })))
    await expect(sendChatMessage(config, request)).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('aborts requests that exceed the configured timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))

    const pending = sendChatMessage({ ...config, timeoutMs: 50 }, request)
    const assertion = expect(pending).rejects.toBeInstanceOf(ChatbotApiError)
    await vi.advanceTimersByTimeAsync(60)
    await assertion
    await expect(pending).rejects.toMatchObject({ kind: 'timeout' })
  })
})
