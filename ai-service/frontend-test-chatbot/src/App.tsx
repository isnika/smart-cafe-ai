import { useMemo, useState } from 'react'
import { ChatWindow } from './components/ChatWindow'
import { DebugPanel } from './components/DebugPanel'
import { Sidebar } from './components/Sidebar'
import { TEST_CASES } from './data/testCases'
import { useChat } from './hooks/useChat'

function App() {
  const chat = useChat()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [debugOpen, setDebugOpen] = useState(true)

  const activeTestInfo = useMemo(() => {
    if (!chat.activeTestRun) return undefined
    const testCase = TEST_CASES.find((item) => item.id === chat.activeTestRun?.testCaseId)
    if (!testCase) return undefined
    return {
      label: `Test ${testCase.number} · Bước ${chat.activeTestRun.stepIndex + 1}/${testCase.steps.length}`,
      expectedIntent: testCase.expectedIntent,
      checks: testCase.checks,
    }
  }, [chat.activeTestRun])

  if (!chat.currentConversation) return null

  const sidebar = (
    <Sidebar
      conversations={chat.conversations}
      currentConversationId={chat.currentConversationId}
      connection={chat.connection}
      evaluations={chat.evaluations}
      onNewChat={() => {
        chat.newChat()
        setSidebarOpen(false)
      }}
      onSelectConversation={chat.selectConversation}
      onDeleteConversation={chat.deleteConversation}
      onClearAll={chat.clearAllConversations}
      onCheckConnection={chat.checkConnection}
      onSelectTestCase={(testCase) => {
        chat.selectTestCase(testCase)
        setSidebarOpen(false)
      }}
      onEvaluateTest={chat.evaluateTest}
      onClose={() => setSidebarOpen(false)}
    />
  )

  const debugPanel = (
    <DebugPanel
      config={chat.config}
      onConfigChange={chat.setConfig}
      exchange={chat.lastDebug}
      connection={chat.connection}
      onTestConnection={chat.checkConnection}
      onClose={() => setDebugOpen(false)}
    />
  )

  return (
    <div className="flex h-dvh min-h-[600px] overflow-hidden bg-cafe-50 text-cafe-950">
      <div className="hidden h-full lg:block">{sidebar}</div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <button
            type="button"
            aria-label="Đóng sidebar"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 bg-cafe-950/35 backdrop-blur-sm"
          />
          <div className="relative h-full shadow-2xl">{sidebar}</div>
        </div>
      )}

      <ChatWindow
        conversation={chat.currentConversation}
        draft={chat.draft}
        sending={chat.sending}
        lastDebug={chat.lastDebug}
        activeTestInfo={activeTestInfo}
        onDraftChange={chat.setDraft}
        onSend={chat.sendMessage}
        onRetry={chat.retryMessage}
        onOpenSidebar={() => setSidebarOpen(true)}
        onToggleDebug={() => setDebugOpen((open) => !open)}
      />

      {debugOpen && <div className="hidden h-full xl:block">{debugPanel}</div>}
      {debugOpen && (
        <div className="fixed inset-0 z-50 flex justify-end xl:hidden">
          <button
            type="button"
            aria-label="Đóng debug panel"
            onClick={() => setDebugOpen(false)}
            className="absolute inset-0 bg-cafe-950/35 backdrop-blur-sm"
          />
          <div className="relative h-full max-w-full shadow-2xl">{debugPanel}</div>
        </div>
      )}
    </div>
  )
}

export default App
