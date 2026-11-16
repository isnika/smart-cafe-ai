import { Check, ChevronRight, FlaskConical, X } from 'lucide-react'
import { TEST_CASES } from '../data/testCases'
import type { ChatTestCase, TestEvaluation } from '../types/chat'

interface TestCasePanelProps {
  evaluations: Record<string, TestEvaluation>
  onSelect: (testCase: ChatTestCase) => void
  onEvaluate: (testCaseId: string, evaluation: TestEvaluation) => void
}

export function TestCasePanel({ evaluations, onSelect, onEvaluate }: TestCasePanelProps) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center gap-2 px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-cafe-400">
        <FlaskConical className="h-3.5 w-3.5" /> Test cases
      </div>
      <div className="space-y-1">
        {TEST_CASES.map((testCase) => {
          const evaluation = evaluations[testCase.id] ?? 'not-run'
          return (
            <div key={testCase.id} className="group rounded-xl border border-transparent hover:border-cafe-100 hover:bg-white/70">
              <button
                type="button"
                onClick={() => onSelect(testCase)}
                title={testCase.description}
                className="flex w-full items-center gap-2 px-2 py-2 text-left"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-cafe-100 font-mono text-[10px] font-bold text-cafe-700">
                  {testCase.number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-cafe-900">{testCase.title}</span>
                  <span className="block truncate text-[10px] text-cafe-400">
                    {testCase.category} · {testCase.expectedIntent}
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-cafe-300" />
              </button>
              <div className="hidden items-center gap-1 px-2 pb-2 group-hover:flex">
                <span className="mr-auto text-[9px] uppercase tracking-wide text-cafe-400">
                  {evaluation === 'not-run' ? 'Chưa đánh giá' : evaluation === 'pass' ? 'PASS thủ công' : 'FAIL thủ công'}
                </span>
                <button
                  type="button"
                  onClick={() => onEvaluate(testCase.id, evaluation === 'pass' ? 'not-run' : 'pass')}
                  aria-label={`Đánh dấu ${testCase.title} pass`}
                  className={`rounded p-1 ${evaluation === 'pass' ? 'bg-sage-200 text-sage-800' : 'text-cafe-400 hover:bg-sage-100 hover:text-sage-700'}`}
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onEvaluate(testCase.id, evaluation === 'fail' ? 'not-run' : 'fail')}
                  aria-label={`Đánh dấu ${testCase.title} fail`}
                  className={`rounded p-1 ${evaluation === 'fail' ? 'bg-red-100 text-red-700' : 'text-cafe-400 hover:bg-red-50 hover:text-red-600'}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
