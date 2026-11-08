import {
  Bot,
  CheckCircle2,
  Coffee,
  History,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react'
import type {
  ChatTestCase,
  ConnectionState,
  Conversation,
  TestEvaluation,
} from '../types/chat'
import { TestCasePanel } from './TestCasePanel'

interface SidebarProps {
  conversations: Conversation[]
  currentConversationId: string
  connection: ConnectionState
  evaluations: Record<string, TestEvaluation>
  onNewChat: () => void
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
  onClearAll: () => void
  onCheckConnection: () => void
  onSelectTestCase: (testCase: ChatTestCase) => void
  onEvaluateTest: (testCaseId: string, evaluation: TestEvaluation) => void
  onClose?: () => void
}

function connectionStyle(status: ConnectionState['status']) {
  if (status === 'online') return 'bg-sage-100 text-sage-800'
  if (status === 'offline') return 'bg-red-50 text-red-700'
  return 'bg-cafe-100 text-cafe-700'
}

export function Sidebar({
  conversations,
  currentConversationId,
  connection,
  evaluations,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onClearAll,
  onCheckConnection,
  onSelectTestCase,
  onEvaluateTest,
  onClose,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-[286px] shrink-0 flex-col border-r border-cafe-100 bg-cafe-50/95 px-3 py-4 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-2">
        <div className="relative grid h-11 w-11 place-items-center rounded-2xl bg-cafe-800 text-white shadow-soft">
          <Coffee className="h-5 w-5" />
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-cafe-50 bg-sage-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold text-cafe-950">Smart Café AI</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-cafe-400">Chat tester</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-cafe-500 hover:bg-cafe-100 lg:hidden" aria-label="Đóng sidebar">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onNewChat}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-cafe-800 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-cafe-700"
      >
        <Plus className="h-4 w-4" /> New Chat
      </button>

      <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mb-2 flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-cafe-400">
            <History className="h-3.5 w-3.5" /> Lịch sử
          </div>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Xóa toàn bộ lịch sử hội thoại trên trình duyệt?')) onClearAll()
            }}
            className="rounded-md p-1 text-cafe-400 hover:bg-red-50 hover:text-red-600"
            title="Xóa toàn bộ lịch sử"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="max-h-[28vh] space-y-1 overflow-y-auto pr-1 scrollbar-thin">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => {
                onSelectConversation(conversation.id)
                onClose?.()
              }}
              className={`group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                conversation.id === currentConversationId
                  ? 'bg-white text-cafe-950 shadow-sm ring-1 ring-cafe-100'
                  : 'text-cafe-600 hover:bg-white/70 hover:text-cafe-900'
              }`}
            >
              <Bot className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{conversation.title}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation()
                  onDeleteConversation(conversation.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onDeleteConversation(conversation.id)
                }}
                className="hidden rounded p-1 text-cafe-300 hover:bg-red-50 hover:text-red-600 group-hover:block"
              >
                <Trash2 className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
          <TestCasePanel evaluations={evaluations} onSelect={onSelectTestCase} onEvaluate={onEvaluateTest} />
        </div>
      </div>

      <div className={`mt-3 rounded-xl p-3 ${connectionStyle(connection.status)}`}>
        <div className="flex items-start gap-2">
          {connection.status === 'checking' ? (
            <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          ) : connection.status === 'online' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : connection.status === 'offline' ? (
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide">Backend</p>
            <p className="mt-0.5 break-words text-[11px] leading-4">{connection.message}</p>
            {connection.responseTimeMs !== undefined && (
              <p className="mt-1 font-mono text-[10px] opacity-70">{connection.responseTimeMs} ms</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onCheckConnection}
          disabled={connection.status === 'checking'}
          className="mt-2 w-full rounded-lg bg-white/60 px-2 py-1.5 text-[11px] font-bold transition hover:bg-white disabled:opacity-50"
        >
          Test Connection
        </button>
      </div>
    </aside>
  )
}
