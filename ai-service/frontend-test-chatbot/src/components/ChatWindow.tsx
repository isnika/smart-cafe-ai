import { Bot, Bug, Coffee, Menu, MessageSquareText, Sparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Conversation, DebugExchange } from '../types/chat'
import { ChatInput } from './ChatInput'
import { ChatMessage } from './ChatMessage'

interface ChatWindowProps {
  conversation: Conversation
  draft: string
  sending: boolean
  lastDebug: DebugExchange | null
  activeTestLabel?: string
  onDraftChange: (value: string) => void
  onSend: () => void
  onRetry: (messageId: string) => void
  onOpenSidebar: () => void
  onToggleDebug: () => void
}

const STARTERS = [
  'Quán có những món cà phê nào?',
  'Matcha Latte giá bao nhiêu?',
  'Mình thích đồ uống ít ngọt.',
]

export function ChatWindow({
  conversation,
  draft,
  sending,
  lastDebug,
  activeTestLabel,
  onDraftChange,
  onSend,
  onRetry,
  onOpenSidebar,
  onToggleDebug,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [conversation.messages, sending])

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-[#fcfaf7]">
      <header className="flex h-[70px] shrink-0 items-center gap-3 border-b border-cafe-100 bg-white/85 px-3 backdrop-blur-xl sm:px-5">
        <button type="button" onClick={onOpenSidebar} className="rounded-xl p-2.5 text-cafe-600 hover:bg-cafe-50 lg:hidden" aria-label="Mở sidebar">
          <Menu className="h-5 w-5" />
        </button>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-sage-100 text-sage-700">
          <Bot className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-bold text-cafe-950">{conversation.title}</h1>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-cafe-400">
            <span>Smart Café RAG</span>
            {lastDebug?.statusCode && (
              <>
                <span>•</span>
                <span className={lastDebug.statusCode < 400 ? 'text-sage-600' : 'text-red-600'}>HTTP {lastDebug.statusCode}</span>
                <span>•</span>
                <span>{lastDebug.responseTimeMs} ms</span>
              </>
            )}
          </div>
        </div>
        {activeTestLabel && (
          <div className="hidden rounded-full border border-sage-200 bg-sage-50 px-3 py-1.5 text-[10px] font-bold text-sage-700 sm:block">
            {activeTestLabel}
          </div>
        )}
        <button
          type="button"
          onClick={onToggleDebug}
          className="inline-flex items-center gap-2 rounded-xl border border-cafe-200 bg-white px-3 py-2 text-xs font-semibold text-cafe-700 transition hover:bg-cafe-50"
        >
          <Bug className="h-4 w-4" />
          <span className="hidden sm:inline">Debug</span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {conversation.messages.length === 0 ? (
          <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center px-5 py-12 text-center">
            <div className="relative grid h-20 w-20 place-items-center rounded-[28px] bg-cafe-800 text-white shadow-soft">
              <Coffee className="h-9 w-9" />
              <span className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full border-4 border-[#fcfaf7] bg-sage-400 text-white">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
            </div>
            <h2 className="mt-6 font-display text-3xl font-bold text-cafe-950">Kiểm thử một cuộc hội thoại</h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-cafe-500">
              Gửi request thật tới FastAPI, theo dõi history, nguồn retrieval và toàn bộ payload trong Debug Console.
            </p>
            <div className="mt-7 grid w-full gap-2 sm:grid-cols-3">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => onDraftChange(starter)}
                  className="rounded-2xl border border-cafe-100 bg-white p-4 text-left text-xs leading-5 text-cafe-700 shadow-sm transition hover:-translate-y-0.5 hover:border-cafe-300 hover:shadow-soft"
                >
                  <MessageSquareText className="mb-3 h-4 w-4 text-sage-600" />
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-6 px-4 py-7 sm:px-6 sm:py-9">
            {conversation.messages.map((message) => (
              <ChatMessage key={message.id} message={message} onRetry={onRetry} disabled={sending} />
            ))}
            {sending && (
              <div className="flex items-center gap-3 text-xs text-cafe-500">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-sage-100 text-sage-700">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-cafe-100 bg-white px-4 py-3 shadow-sm">
                  <span className="mr-2">AI đang trả lời</span>
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cafe-400 [animation-delay:-.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cafe-400 [animation-delay:-.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cafe-400" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {activeTestLabel && (
        <div className="border-t border-sage-100 bg-sage-50 px-4 py-2 text-center text-[10px] font-semibold text-sage-700 sm:hidden">
          {activeTestLabel}
        </div>
      )}
      <ChatInput value={draft} onChange={onDraftChange} onSend={onSend} sending={sending} />
    </main>
  )
}
