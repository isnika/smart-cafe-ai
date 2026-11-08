import { Check, Clipboard, Code2, Copy, Database, X } from 'lucide-react'
import { useState } from 'react'
import type { ApiConfig, ConnectionState, DebugExchange } from '../types/chat'

interface DebugPanelProps {
  config: ApiConfig
  onConfigChange: (config: ApiConfig) => void
  exchange: DebugExchange | null
  connection: ConnectionState
  onTestConnection: () => void
  onClose: () => void
}

function pretty(value: unknown): string {
  if (value === undefined) return '— Chưa có dữ liệu —'
  return JSON.stringify(value, null, 2)
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      }}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-cafe-500 hover:bg-cafe-100 hover:text-cafe-800"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Đã copy' : label}
    </button>
  )
}

export function DebugPanel({
  config,
  onConfigChange,
  exchange,
  connection,
  onTestConnection,
  onClose,
}: DebugPanelProps) {
  return (
    <aside className="flex h-full w-[370px] shrink-0 flex-col border-l border-cafe-100 bg-white shadow-[-18px_0_45px_rgba(77,48,40,0.06)]">
      <header className="flex items-center gap-3 border-b border-cafe-100 px-4 py-4">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-cafe-100 text-cafe-700">
          <Code2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-cafe-950">Debug Console</h2>
          <p className="text-[10px] text-cafe-400">Request / response inspector</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-cafe-400 hover:bg-cafe-50 hover:text-cafe-800" aria-label="Đóng debug panel">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 scrollbar-thin">
        <section>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-cafe-400">
            <Database className="h-3.5 w-3.5" /> API configuration
          </div>
          <div className="space-y-3 rounded-2xl border border-cafe-100 bg-cafe-50/60 p-3">
            <label className="block text-[11px] font-semibold text-cafe-700">
              Base URL
              <input
                value={config.baseUrl}
                onChange={(event) => onConfigChange({ ...config, baseUrl: event.target.value })}
                className="mt-1.5 w-full rounded-lg border border-cafe-200 bg-white px-3 py-2 font-mono text-[11px] text-cafe-900 outline-none focus:border-cafe-400"
              />
            </label>
            <div className="grid grid-cols-[1fr_104px] gap-2">
              <label className="block text-[11px] font-semibold text-cafe-700">
                Endpoint
                <input
                  value={config.endpoint}
                  onChange={(event) => onConfigChange({ ...config, endpoint: event.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-cafe-200 bg-white px-3 py-2 font-mono text-[11px] text-cafe-900 outline-none focus:border-cafe-400"
                />
              </label>
              <label className="block text-[11px] font-semibold text-cafe-700">
                Timeout (ms)
                <input
                  type="number"
                  min={1000}
                  max={180000}
                  value={config.timeoutMs}
                  onChange={(event) => onConfigChange({ ...config, timeoutMs: Math.max(1000, Number(event.target.value) || 1000) })}
                  className="mt-1.5 w-full rounded-lg border border-cafe-200 bg-white px-2 py-2 font-mono text-[11px] text-cafe-900 outline-none focus:border-cafe-400"
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-cafe-700">
                <input
                  type="checkbox"
                  checked={config.debugMode}
                  onChange={(event) => onConfigChange({ ...config, debugMode: event.target.checked })}
                  className="h-4 w-4 accent-cafe-700"
                />
                Debug mode
              </label>
              <button
                type="button"
                onClick={onTestConnection}
                disabled={connection.status === 'checking'}
                className="rounded-lg bg-cafe-800 px-3 py-2 text-[10px] font-bold text-white hover:bg-cafe-700 disabled:opacity-50"
              >
                Test /health
              </button>
            </div>
          </div>
        </section>

        {!config.debugMode ? (
          <div className="rounded-2xl border border-dashed border-cafe-200 p-6 text-center text-xs text-cafe-500">
            Debug mode đang tắt. Request vẫn gửi bình thường nhưng panel ẩn payload.
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-2">
              <Metric label="HTTP status" value={exchange?.statusCode?.toString() ?? '—'} tone={exchange?.statusCode && exchange.statusCode < 400 ? 'green' : exchange?.statusCode ? 'red' : 'brown'} />
              <Metric label="Response time" value={exchange ? `${exchange.responseTimeMs} ms` : '—'} />
              <Metric label="Response size" value={formatBytes(exchange?.responseBytes)} />
              <Metric label="History sent" value={exchange?.historyCount.toString() ?? '—'} />
            </section>

            {exchange?.tokenUsage && (
              <section className="rounded-2xl border border-sage-100 bg-sage-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-sage-700">Token usage từ Backend</p>
                <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px] text-sage-900">
                  <span>In: {exchange.tokenUsage.inputTokens ?? '—'}</span>
                  <span>Out: {exchange.tokenUsage.outputTokens ?? '—'}</span>
                  <span>Total: {exchange.tokenUsage.totalTokens ?? '—'}</span>
                </div>
              </section>
            )}

            {exchange?.errorMessage && (
              <section className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
                <p className="text-[10px] font-bold uppercase tracking-wide">Error message</p>
                <p className="mt-1">{exchange.errorMessage}</p>
              </section>
            )}

            <JsonBlock title="Request JSON" icon={<Clipboard className="h-3.5 w-3.5" />} value={exchange?.request} copyLabel="Copy request" />
            <JsonBlock title="Response JSON" icon={<Code2 className="h-3.5 w-3.5" />} value={exchange?.response} copyLabel="Copy response" />
          </>
        )}
      </div>

      <footer className="border-t border-cafe-100 px-4 py-3 text-[10px] text-cafe-400">
        <span className="font-mono">POST</span> · {exchange?.endpoint ?? `${config.baseUrl}${config.endpoint}`}
      </footer>
    </aside>
  )
}

function Metric({ label, value, tone = 'brown' }: { label: string; value: string; tone?: 'brown' | 'green' | 'red' }) {
  const toneClass = tone === 'green' ? 'text-sage-700' : tone === 'red' ? 'text-red-700' : 'text-cafe-900'
  return (
    <div className="rounded-xl border border-cafe-100 bg-cafe-50/70 p-3">
      <p className="text-[9px] font-bold uppercase tracking-wide text-cafe-400">{label}</p>
      <p className={`mt-1 font-mono text-xs font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}

function JsonBlock({ title, icon, value, copyLabel }: { title: string; icon: React.ReactNode; value: unknown; copyLabel: string }) {
  const content = pretty(value)
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-cafe-400">
        {icon} <span className="flex-1">{title}</span> <CopyButton value={content} label={copyLabel} />
      </div>
      <pre className="max-h-72 overflow-auto rounded-2xl bg-cafe-950 p-3 font-mono text-[10px] leading-5 text-cafe-100 scrollbar-thin">{content}</pre>
    </section>
  )
}
