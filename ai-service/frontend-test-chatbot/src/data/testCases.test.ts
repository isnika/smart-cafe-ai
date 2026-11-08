import { describe, expect, it } from 'vitest'
import { TEST_CASES } from './testCases'

describe('Smart Café regression cases', () => {
  it('keeps every test manually reviewable with an expected intent and checks', () => {
    expect(TEST_CASES).toHaveLength(16)
    expect(new Set(TEST_CASES.map((testCase) => testCase.id)).size).toBe(TEST_CASES.length)
    for (const testCase of TEST_CASES) {
      expect(testCase.expectedIntent).not.toBe('')
      expect(testCase.checks.length).toBeGreaterThan(0)
      expect(testCase.steps.length).toBeGreaterThan(0)
    }
  })

  it('contains the Wi-Fi/Matcha regression and contextual sweetness flow', () => {
    expect(TEST_CASES.find((testCase) => testCase.id === 'wifi-regression')).toMatchObject({
      expectedIntent: 'WIFI_QUERY',
      steps: ['Có mạng không?'],
    })
    expect(TEST_CASES.find((testCase) => testCase.id === 'sweetness-followup')?.steps).toEqual([
      'Bạc xỉu bao nhiêu tiền?',
      'Có ít ngọt không?',
    ])
  })
})
