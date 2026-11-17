import { Bot, Check, ChevronDown, Clock3, Copy, RefreshCw, UserRound } from 'lucide-react'
import { useState } from 'react'
import type { ChatUiMessage } from '../types/chat'

interface ChatMessageProps {
  message: ChatUiMessage
  onRetry: (messageId: string) => void
  disabled: boolean
}

export function ChatMessage({ message, onRetry, disabled }: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const copy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <article className={`group flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
          isUser ? 'bg-cafe-200 text-cafe-800' : 'bg-sage-100 text-sage-700 ring-1 ring-sage-200'
        }`}
      >
        {isUser ? <UserRound className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={`min-w-0 max-w-[85%] sm:max-w-[76%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 ${
            isUser
              ? 'rounded-tr-md bg-cafe-800 text-white shadow-sm'
              : 'rounded-tl-md border border-cafe-100 bg-white text-cafe-950 shadow-sm'
          }`}
        >
          {message.content}
          {message.status === 'pending' && (
            <span className="ml-2 inline-flex items-center gap-1 align-middle text-xs opacity-70">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
            </span>
          )}
        </div>

        {message.status === 'error' && (
          <div className="mt-2 w-full rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <p className="leading-5">{message.error}</p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRetry(message.id)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-2.5 py-1.5 font-semibold transition hover:bg-red-200 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {!isUser && message.status === 'success' && (
          <div className="mt-1.5 flex w-full flex-wrap items-center gap-2 px-1 text-[11px] text-cafe-500">
            <button type="button" onClick={copy} className="inline-flex items-center gap-1 hover:text-cafe-800">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Đã copy' : 'Copy'}
            </button>
            {message.metrics && (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" /> {message.metrics.durationMs} ms
              </span>
            )}
          </div>
        )}

        {!isUser && message.sources && message.sources.length > 0 && (
          <details className="mt-2 w-full rounded-xl border border-sage-100 bg-sage-50/60 px-3 py-2 text-xs text-sage-900">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold">
              <span>{message.sources.length} nguồn truy xuất</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </summary>
            <div className="mt-2 space-y-2">
              {message.sources.map((source, index) => (
                <div key={`${source.source}-${source.heading}-${index}`} className="rounded-lg bg-white/80 p-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-cafe-900">{source.heading}</p>
                    <span className="shrink-0 font-mono text-[10px] text-sage-700">{source.score.toFixed(3)}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-cafe-500">{source.source} · {source.category}</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </article>
  )
}
