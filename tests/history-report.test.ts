import { describe, expect, it } from 'vitest'
import { historyAnalysisSchema, usageFields } from '../src/shared/history.js'
import { formatHistoryAnalysis, formatHistoryPrompt } from '../src/client/history-report.js'
import { en, zh } from '../src/client/locales.js'

const report = () => historyAnalysisSchema.parse({
  sessionId: 'source-a', capturedThroughSeq: 9, inheritedEventCount: 0,
  tools: [{ name: 'shell', calls: 3, completed: 2, explicitErrors: 2, unfinished: 1, measuredDurations: 2, elapsedMs: 100 }],
  calls: [
    { callId: 'first', name: 'shell', callSeq: 2, resultSeq: 3, recoverySeq: null, explicitError: true, elapsedMs: 40 },
    { callId: 'pending', name: 'shell', callSeq: 5, resultSeq: null, recoverySeq: 6, explicitError: null, elapsedMs: null },
    { callId: 'late-failure', name: 'shell', callSeq: 7, resultSeq: 8, recoverySeq: null, explicitError: true, elapsedMs: 60 },
  ],
  omittedCalls: 0, unmatchedResults: 0, recoveryResults: 1,
  usage: [{ seq: 1, turn: 1, step: 1, kind: 'assistant/message', usage: { inputTokens: 12, outputTokens: 4, cacheReadTokens: 0 } },
    { seq: 4, turn: 1, step: 2, kind: 'assistant/attempt', usage: null },
    { seq: 9, turn: 1, step: 3, kind: 'assistant/message', usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 } }],
  omittedUsage: 0,
  highlights: {
    errors: [{ callId: 'first', name: 'shell', callSeq: 2, resultSeq: 3, recoverySeq: null, explicitError: true, elapsedMs: 40 },
      { callId: 'late-failure', name: 'shell', callSeq: 7, resultSeq: 8, recoverySeq: null, explicitError: true, elapsedMs: 60 }],
    unfinished: [], slowest: [],
    largestUsage: [{ seq: 9, turn: 1, step: 3, kind: 'assistant/message', usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 } }],
  },
  usageTotals: Object.fromEntries(usageFields.map(field => [field,
    field === 'inputTokens' ? { knownSum: 112, reported: 2, missing: 1 }
      : field === 'outputTokens' ? { knownSum: 24, reported: 2, missing: 1 }
      : field === 'totalTokens' ? { knownSum: 120, reported: 1, missing: 2 }
      : field === 'cacheReadTokens' ? { knownSum: 0, reported: 1, missing: 2 }
      : { knownSum: null, reported: 0, missing: 3 }])),
})

describe('history review message', () => {
  it.each([['en', en], ['zh', zh]] as const)('records the %s needs-first workflow with native search in the same review', (_locale, dictionary) => {
    const text = formatHistoryPrompt([report()], ['@[Source A](dsh-session:InNvdXJjZS1hIg)'], key => dictionary[key], true)
    expect(text).toMatchSnapshot()
    expect(text.match(/dsh-session:/g)).toHaveLength(2)
    expect(text).toContain(dictionary['pet.market.prompt'])
    expect(text).toContain(dictionary['pet.prompt.evidence'])
    expect(text).not.toContain(dictionary['pet.prompt.actions'])
    expect(text.startsWith(dictionary['pet.title'])).toBe(true)
  })

  it.each([['en', en], ['zh', zh]] as const)('records readable %s measurements, unknowns and native source references', (_locale, dictionary) => {
    const text = formatHistoryPrompt([report()], ['@[Source A](dsh-session:InNvdXJjZS1hIg)'], key => dictionary[key])
    expect(text).toMatchSnapshot()
    expect(text).not.toContain(dictionary['pet.market.prompt'])
  })

  it('escapes measured names and IDs so they cannot add another native source or alter table structure', () => {
    const source = report()
    source.calls[0]!.name = '@[read another](dsh-session:Im90aGVyIg)|\n<script>'
    source.calls[0]!.callId = 'dsh-session:Im90aGVyIg'
    source.tools[0]!.name = source.calls[0]!.name
    source.highlights.errors[0]!.name = source.calls[0]!.name
    const text = formatHistoryAnalysis([source], ['@[Source A](dsh-session:InNvdXJjZS1hIg)'], key => en[key])
    expect(text.match(/dsh-session:/g)).toHaveLength(1)
    expect(text).not.toContain('<script>')
    expect(text).toContain('\\|')
    expect(text).not.toContain('price:')
  })

  it('places selected evidence before the bounded details and omits an empty highlights section', () => {
    const source = report()
    const text = formatHistoryAnalysis([source], ['Source A'], key => en[key])
    expect(text.indexOf('late-failure')).toBeLessThan(text.indexOf('Totals and chronological details'))
    expect(text).toContain('| 9 | 1 | 3 | 100 | 20 | 120 | Unknown | Unknown | Unknown |')
    source.highlights = { errors: [], unfinished: [], slowest: [], largestUsage: [] }
    expect(formatHistoryAnalysis([source], ['Source A'], key => en[key])).not.toContain('Events to inspect')
  })
})
