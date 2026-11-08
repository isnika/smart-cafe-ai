import type {
  ApiConfig,
  ChatRequest,
  ChatResponse,
  RequestMetrics,
  SourceChunk,
  TokenUsage,
} from '../types/chat'

type ApiErrorKind =
  | 'timeout'
  | 'network'
  | 'http'
  | 'invalid-json'
  | 'invalid-response'

export class ChatbotApiError extends Error {
  readonly kind: ApiErrorKind
  readonly statusCode?: number
  readonly response?: unknown
  readonly metrics: RequestMetrics

  constructor(
    message: string,
    kind: ApiErrorKind,
    metrics: RequestMetrics,
    options?: { statusCode?: number; response?: unknown },
  ) {
    super(message)
    this.name = 'ChatbotApiError'
    this.kind = kind
    this.statusCode = options?.statusCode
    this.response = options?.response
    this.metrics = metrics
  }
}

export interface ChatApiResult {
  data: ChatResponse
  rawResponse: unknown
  metrics: RequestMetrics
}

export interface HealthResult {
  online: boolean
  statusCode: number
  responseTimeMs: number
  payload: unknown
}

export function joinUrl(baseUrl: string, endpoint: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  const path = endpoint.trim().startsWith('/') ? endpoint.trim() : `/${endpoint.trim()}`
  return `${base}${path}`
}

function responseSize(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

function parseJson(text: string, metrics: RequestMetrics): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ChatbotApiError(
      'Backend trả về dữ liệu không phải JSON hợp lệ.',
      'invalid-json',
      metrics,
    )
  }
}

function isSourceChunk(value: unknown): value is SourceChunk {
  if (!value || typeof value !== 'object') return false
  const source = value as Record<string, unknown>
  return (
    typeof source.source === 'string' &&
    typeof source.category === 'string' &&
    typeof source.heading === 'string' &&
    typeof source.score === 'number' &&
    typeof source.content === 'string'
  )
}

function isChatResponse(value: unknown): value is ChatResponse {
  if (!value || typeof value !== 'object') return false
  const response = value as Record<string, unknown>
  return (
    typeof response.answer === 'string' &&
    Array.isArray(response.sources) &&
    response.sources.every(isSourceChunk)
  )
}

function numberField(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    if (typeof record[key] === 'number') return record[key]
  }
  return undefined
}

export function extractTokenUsage(payload: unknown): TokenUsage | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const root = payload as Record<string, unknown>
  const raw = root.usage ?? root.token_usage
  if (!raw || typeof raw !== 'object') return undefined
  const usage = raw as Record<string, unknown>
  const result: TokenUsage = {
    inputTokens: numberField(usage, 'input_tokens', 'prompt_tokens'),
    outputTokens: numberField(usage, 'output_tokens', 'completion_tokens'),
    totalTokens: numberField(usage, 'total_tokens'),
  }
  return Object.values(result).some((value) => value !== undefined) ? result : undefined
}

function backendDetail(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const detail = (payload as Record<string, unknown>).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (!item || typeof item !== 'object') return String(item)
        const record = item as Record<string, unknown>
        return typeof record.msg === 'string' ? record.msg : JSON.stringify(record)
      })
      .join(' · ')
  }
  return undefined
}

function httpErrorMessage(status: number, payload: unknown): string {
  const detail = backendDetail(payload)
  if (detail) return detail
  const messages: Record<number, string> = {
    400: 'Request không hợp lệ. Hãy kiểm tra nội dung gửi lên.',
    422: 'Payload không đúng schema FastAPI.',
    429: 'Backend đang giới hạn tần suất request. Vui lòng thử lại sau.',
    500: 'Backend gặp lỗi nội bộ.',
    502: 'Gateway không nhận được phản hồi hợp lệ từ AI provider.',
    503: 'Chatbot hoặc AI provider đang tạm thời không khả dụng.',
  }
  return messages[status] ?? `Backend trả về HTTP ${status}.`
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

export async function sendChatMessage(
  config: ApiConfig,
  request: ChatRequest,
): Promise<ChatApiResult> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), config.timeoutMs)
  const started = performance.now()
  try {
    let response: Response
    try {
      response = await fetch(joinUrl(config.baseUrl, config.endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      })
    } catch (error) {
      const metrics = { durationMs: Math.round(performance.now() - started) }
      if (isAbortError(error)) {
        throw new ChatbotApiError(
          `Request vượt quá timeout ${config.timeoutMs} ms.`,
          'timeout',
          metrics,
        )
      }
      throw new ChatbotApiError(
        'Không kết nối được Backend. Kiểm tra server, Base URL và cấu hình CORS.',
        'network',
        metrics,
      )
    }

    const text = await response.text()
    const metrics: RequestMetrics = {
      statusCode: response.status,
      durationMs: Math.round(performance.now() - started),
      responseBytes: responseSize(text),
    }
    const payload = parseJson(text, metrics)
    metrics.tokenUsage = extractTokenUsage(payload)

    if (!response.ok) {
      throw new ChatbotApiError(
        httpErrorMessage(response.status, payload),
        'http',
        metrics,
        { statusCode: response.status, response: payload },
      )
    }
    if (!isChatResponse(payload)) {
      throw new ChatbotApiError(
        'Response JSON thiếu answer hoặc sources đúng schema.',
        'invalid-response',
        metrics,
        { statusCode: response.status, response: payload },
      )
    }
    return { data: payload, rawResponse: payload, metrics }
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

export async function testBackendConnection(config: ApiConfig): Promise<HealthResult> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), config.timeoutMs)
  const started = performance.now()
  try {
    const response = await fetch(joinUrl(config.baseUrl, '/health'), {
      signal: controller.signal,
    })
    const text = await response.text()
    let payload: unknown
    try {
      payload = JSON.parse(text) as unknown
    } catch {
      payload = text
    }
    return {
      online: response.ok,
      statusCode: response.status,
      responseTimeMs: Math.round(performance.now() - started),
      payload,
    }
  } catch (error) {
    const reason = isAbortError(error)
      ? `Health check timeout sau ${config.timeoutMs} ms.`
      : 'Không kết nối được /health. Kiểm tra Backend hoặc CORS.'
    throw new Error(reason)
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}
