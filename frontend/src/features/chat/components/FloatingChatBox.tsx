import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { AlertCircle, Bot, Headset, Loader2, RefreshCw, Send, User, X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui';
import type { ChatMessage } from '@/shared/types';
import { useChat } from '../hooks/useChat';
import { HANDLER_NOTICE, MAX_MESSAGE_LENGTH, SUGGESTED_PROMPTS, isPendingMessage, productCardsOf } from '../model';
import { ChatProductCard } from './ChatProductCard';

const MAX_INPUT_HEIGHT = 112;

/** Nút chat AI nổi + panel hội thoại cho khách (đã đăng nhập hoặc khách vãng lai). Gắn trong CustomerLayout. */
export function FloatingChatBox() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const chat = useChat(open);
  const panelId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const closed = chat.handler === 'closed';
  const inputLocked = !chat.ready || chat.sending || closed;
  const canHandOff = chat.ready && chat.handler === 'ai' && !chat.handingOff;

  // Tự cuộn xuống cuối khi có tin mới / đang gõ / đổi trạng thái.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, chat.messages.length, chat.typing, chat.handler, chat.sendError]);

  // Trả focus về ô nhập khi mở panel và sau mỗi lượt gửi (ô bị khoá lúc đang gửi nên mất focus).
  useEffect(() => {
    if (open && !inputLocked) inputRef.current?.focus();
  }, [open, inputLocked]);

  const resizeInput = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  };

  const submit = (text: string) => {
    const content = text.trim();
    if (!content || inputLocked) return;
    chat.send(content);
    setDraft('');
    requestAnimationFrame(() => resizeInput(inputRef.current));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing: đang gõ dấu tiếng Việt (Telex/VNI) — Enter lúc này là chốt chữ, không phải gửi.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(draft);
    }
  };

  return (
    <>
      {open && (
        <section
          id={panelId}
          aria-label="Trợ lý AI"
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          className="fixed bottom-36 right-4 z-40 flex h-[min(34rem,calc(100dvh-10rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-primary-100 bg-white shadow-modal"
        >
          <header className="flex items-center gap-2 bg-ai-gradient px-3 py-2.5 text-white">
            <Bot className="size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-body font-semibold">Trợ lý AI</h2>
              <p className="truncate text-caption opacity-90">
                {chat.handler === 'ai' ? 'Gợi ý món theo khẩu vị của bạn' : chat.handler === 'closed' ? 'Đã kết thúc' : 'Đang chờ nhân viên'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={chat.handOff}
              disabled={!canHandOff}
              loading={chat.handingOff}
              leftIcon={<Headset className="size-4" aria-hidden />}
              className="shrink-0 bg-white/15 text-white hover:bg-white/25 active:bg-white/30 disabled:opacity-60"
            >
              Chuyển nhân viên
            </Button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Đóng khung chat"
              className="grid size-8 shrink-0 place-items-center rounded-sm hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <X className="size-5" aria-hidden />
            </button>
          </header>

          <div
            ref={listRef}
            role="log"
            aria-label="Tin nhắn với trợ lý AI"
            aria-live="polite"
            aria-busy={chat.typing}
            className="flex flex-1 flex-col gap-3 overflow-y-auto bg-primary-50 p-3"
          >
            {chat.loading && (
              <p className="flex items-center justify-center gap-2 py-6 text-body text-gray-500">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Đang kết nối trợ lý…
              </p>
            )}

            {chat.loadError && (
              <div role="alert" className="flex flex-col items-center gap-2 rounded-md bg-error-soft p-3 text-center text-body text-error-strong">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="size-4" aria-hidden /> Không kết nối được trợ lý AI.
                </span>
                <Button size="sm" variant="outline" onClick={chat.reload} leftIcon={<RefreshCw className="size-4" aria-hidden />}>
                  Thử lại
                </Button>
              </div>
            )}

            {chat.ready && chat.messages.length === 0 && (
              <div className="flex flex-col gap-3 py-2">
                <div className="flex items-start gap-2">
                  <BotAvatar />
                  <p className="rounded-lg rounded-tl-sm border border-primary-100 bg-white px-3 py-2 text-body text-gray-800">
                    Xin chào! Mình là trợ lý AI của quán. Bạn muốn uống gì hôm nay? Hỏi mình để được gợi ý món nhé.
                  </p>
                </div>
                {!closed && (
                  <div className="flex flex-wrap gap-2 pl-9" aria-label="Câu hỏi gợi ý">
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => submit(prompt)}
                        disabled={inputLocked}
                        className="rounded-full border border-ai-from/30 bg-white px-3 py-1.5 text-caption text-ai-from hover:bg-ai-glow/20 disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {chat.messages.map((m) => (
              <MessageBubble key={m.id} message={m} onNavigate={() => setOpen(false)} />
            ))}

            {chat.typing && (
              <div className="flex items-start gap-2" role="status" aria-label="AI đang trả lời">
                <BotAvatar />
                <p className="flex items-center gap-1 rounded-lg rounded-tl-sm border border-primary-100 bg-white px-3 py-2.5 text-body text-gray-500">
                  <span className="sr-only">AI đang trả lời…</span>
                  <span aria-hidden className="flex items-center gap-1">
                    <Dot delay="0ms" />
                    <Dot delay="150ms" />
                    <Dot delay="300ms" />
                  </span>
                </p>
              </div>
            )}

            {chat.handler !== 'ai' && (
              <p role="status" className="self-center rounded-full bg-white px-3 py-1.5 text-center text-caption text-gray-600 shadow-card">
                {HANDLER_NOTICE[chat.handler]}
              </p>
            )}

            {chat.sendError && (
              <div role="alert" className="flex items-center justify-between gap-2 rounded-md bg-error-soft p-2.5 text-body text-error-strong">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="size-4 shrink-0" aria-hidden /> Không gửi được tin nhắn.
                </span>
                <Button size="sm" variant="outline" onClick={chat.retrySend} leftIcon={<RefreshCw className="size-4" aria-hidden />}>
                  Thử lại
                </Button>
              </div>
            )}

            {chat.handOffError && (
              <div role="alert" className="flex items-center justify-between gap-2 rounded-md bg-error-soft p-2.5 text-body text-error-strong">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="size-4 shrink-0" aria-hidden /> Chưa chuyển được cho nhân viên.
                </span>
                <Button size="sm" variant="outline" onClick={chat.handOff} disabled={!canHandOff}>
                  Thử lại
                </Button>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(draft);
            }}
            className="flex items-end gap-2 border-t border-primary-100 bg-white p-2.5"
          >
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={inputLocked}
              aria-label="Nhập tin nhắn"
              placeholder={closed ? 'Cuộc trò chuyện đã kết thúc' : chat.handler === 'ai' ? 'Nhắn cho trợ lý AI…' : 'Nhắn cho nhân viên…'}
              onChange={(e) => {
                setDraft(e.target.value);
                resizeInput(e.target);
              }}
              onKeyDown={onKeyDown}
              className="max-h-28 min-h-11 flex-1 resize-none rounded-md border border-gray-400 bg-white px-3.5 py-2.5 text-base leading-6 text-gray-950 placeholder:text-gray-600 focus:border-ai-from focus:outline-none focus:ring-2 focus:ring-ai-from/30 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-600 disabled:placeholder:text-gray-500"
            />
            <Button
              type="submit"
              variant="ai"
              aria-label="Gửi tin nhắn"
              disabled={inputLocked || draft.trim() === ''}
              loading={chat.sending}
              className="size-10 shrink-0 px-0"
            >
              {!chat.sending && <Send className="size-4" aria-hidden />}
            </Button>
          </form>
        </section>
      )}

      <button
        type="button"
        aria-label={open ? 'Đóng trợ lý AI' : 'Mở trợ lý AI'}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'fixed bottom-20 right-4 z-40 flex size-14 items-center justify-center rounded-full bg-ai-gradient text-white shadow-dropdown focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai-from',
          !open && 'animate-ai-pulse',
        )}
      >
        {open ? <X className="size-6" aria-hidden /> : <Bot className="size-6" aria-hidden />}
      </button>
    </>
  );
}

function BotAvatar() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ai-gradient text-white" aria-hidden>
      <Bot className="size-4" />
    </span>
  );
}

function Dot({ delay }: { delay: string }) {
  return <span className="size-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: delay }} />;
}

function MessageBubble({ message, onNavigate }: { message: ChatMessage; onNavigate: () => void }) {
  if (message.senderRole === 'Customer') {
    return (
      <div className="flex justify-end">
        <p
          className={cn(
            'max-w-[85%] whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-primary-600 px-3 py-2 text-body text-white',
            isPendingMessage(message) && 'opacity-70',
          )}
        >
          <span className="sr-only">Bạn: </span>
          {message.content}
        </p>
      </div>
    );
  }

  const cards = message.senderRole === 'AI' ? productCardsOf(message) : [];
  const isStaff = message.senderRole === 'Staff';
  return (
    <div className="flex items-start gap-2">
      {isStaff ? (
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary-700 text-white" aria-hidden>
          <User className="size-4" />
        </span>
      ) : (
        <BotAvatar />
      )}
      <div className="flex min-w-0 max-w-[85%] flex-col gap-2">
        <p
          className={cn(
            'whitespace-pre-wrap break-words rounded-lg rounded-tl-sm border px-3 py-2 text-body text-gray-800',
            isStaff ? 'border-secondary-200 bg-secondary-50' : 'border-primary-100 bg-white',
          )}
        >
          <span className="sr-only">{isStaff ? 'Nhân viên: ' : 'Trợ lý AI: '}</span>
          {isStaff && <span className="mb-0.5 block text-caption font-semibold text-secondary-700" aria-hidden>Nhân viên</span>}
          {message.content}
        </p>
        {cards.length > 0 && (
          <ul aria-label="Món gợi ý" className="flex flex-col gap-2">
            {cards.map((card) => (
              <li key={card.productId}>
                <ChatProductCard card={card} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
