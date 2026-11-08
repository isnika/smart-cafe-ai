import { SendHorizontal, Square } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  sending: boolean
}

export function ChatInput({ value, onChange, onSend, sending }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
  }, [value])

  const canSend = Boolean(value.trim()) && value.trim().length <= 2000 && !sending

  return (
    <div className="border-t border-cafe-100 bg-white/90 px-3 py-3 backdrop-blur-xl sm:px-6 sm:py-4">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-end gap-2 rounded-2xl border border-cafe-200 bg-cafe-50/70 p-2 shadow-sm transition focus-within:border-cafe-400 focus-within:bg-white focus-within:shadow-soft">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                if (canSend) onSend()
              }
            }}
            placeholder="Nhập câu hỏi để kiểm thử chatbot…"
            aria-label="Tin nhắn gửi chatbot"
            rows={1}
            maxLength={2000}
            className="max-h-[180px] min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-6 text-cafe-950 outline-none placeholder:text-cafe-400"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label={sending ? 'Đang gửi' : 'Gửi tin nhắn'}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cafe-800 text-white transition hover:bg-cafe-700 disabled:cursor-not-allowed disabled:bg-cafe-200 disabled:text-cafe-400"
          >
            {sending ? <Square className="h-4 w-4 animate-pulse" /> : <SendHorizontal className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-cafe-500">
          <span>Enter để gửi · Shift + Enter để xuống dòng</span>
          <span className={value.length > 1900 ? 'font-semibold text-red-600' : ''}>{value.length}/2000</span>
        </div>
      </div>
    </div>
  )
}
