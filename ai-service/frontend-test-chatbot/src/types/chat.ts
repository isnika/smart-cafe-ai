export type ChatRole = 'user' | 'assistant'

export interface ChatHistoryMessage {
  role: ChatRole
  content: string
}

export interface SourceChunk {
  source: string
  category: string
  heading: string
  score: number
  content: string
}

export interface TokenUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export interface ChatRequest {
  message: string
  history: ChatHistoryMessage[]
}

export interface ChatResponse {
  answer: string
  sources: SourceChunk[]
  usage?: unknown
}

export type MessageStatus = 'pending' | 'success' | 'error'

export interface RequestMetrics {
  statusCode?: number
  durationMs: number
  responseBytes?: number
  tokenUsage?: TokenUsage
}

export interface ChatUiMessage {
  id: string
  role: ChatRole
  content: string
  status: MessageStatus
  createdAt: string
  sources?: SourceChunk[]
  error?: string
  metrics?: RequestMetrics
}

export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatUiMessage[]
}

export interface ApiConfig {
  baseUrl: string
  endpoint: string
  timeoutMs: number
  debugMode: boolean
}

export type ConnectionStatus = 'idle' | 'checking' | 'online' | 'offline'

export interface ConnectionState {
  status: ConnectionStatus
  message: string
  checkedAt?: string
  responseTimeMs?: number
}

export interface DebugExchange {
  id: string
  timestamp: string
  endpoint: string
  method: 'POST'
  request: ChatRequest
  response?: unknown
  statusCode?: number
  responseTimeMs: number
  responseBytes?: number
  errorMessage?: string
  historyCount: number
  tokenUsage?: TokenUsage
}

export type TestEvaluation = 'not-run' | 'pass' | 'fail'

export interface ChatTestCase {
  id: string
  number: string
  title: string
  category: string
  description: string
  steps: string[]
}

export interface ActiveTestRun {
  testCaseId: string
  stepIndex: number
}
