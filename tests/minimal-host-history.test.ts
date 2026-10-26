import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createAssistantMessage, createToolResultMessage, type TokenUsage, type ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionSeq, SessionLogOffset, SESSION_FORMAT_VERSION, type SessionEvent, type SessionId } from '@deepseek-ai/dsh-session'
import type { RetryId } from '@deepseek-ai/dsh-llm-retry/types'
import { analyzeHistory } from '../src/history/analyze.js'
import { historyAnalysisSchema } from '../src/shared/history.js'

const callId = (id: string) => brandString<ToolCallId>(id)
const call = (seq: number, id: string, name = 'shell', time = seq * 10, turn = 1): SessionEvent<'tool/call'> => ({
  type: 'tool/call', seq: SessionSeq(seq), time, data: { turn, step: 1, callId: callId(id), name, arguments: '{"private":"not copied"}' },
})
const result = (seq: number, id: string, isError = false, time = seq * 10, turn = 1): SessionEvent<'tool/result'> => ({
  type: 'tool/result', seq: SessionSeq(seq), time, surfaceOp: 'append', data: { turn, step: 1,
    message: createToolResultMessage({ callId: callId(id), isError, content: [{ type: 'text', text: 'not copied' }] }) },
})
const message = (seq: number, step: number, usage?: TokenUsage): SessionEvent<'assistant/message'> => ({
  type: 'assistant/message', seq: SessionSeq(seq), time: seq * 10, surfaceOp: 'append', data: {
    turn: 1, step, stream: [], message: createAssistantMessage({ source: { provider: 'fixture', model: 'fixture' }, content: [] }),
    ...(usage === undefined ? {} : { usage }),
  },
})
const analyze = (events: SessionEvent[], inherited = 0) => analyzeHistory({
  header: { id: brandString<SessionId>('selected-source'), version: SESSION_FORMAT_VERSION, createdAt: 0, isSeeded: inherited > 0 },
  cursor: events.at(-1)?.seq ?? -1, events, inheritedEventCount: SessionLogOffset(inherited),
})

describe('native history measurements', () => {
  it('pairs overlapping calls by identity, keeps unfinished calls unknown and measures only recorded nonnegative intervals', () => {
    const report = analyze([call(0, 'a'), call(1, 'b'), result(2, 'b', true), result(3, 'a'),
      call(4, 'pending'), call(5, 'clock'), result(6, 'clock', false, 20), result(7, 'orphan')], 2)
    expect(historyAnalysisSchema.parse(report)).toEqual(report)
    expect(report.tools).toEqual([{ name: 'shell', calls: 4, completed: 3, explicitErrors: 1, unfinished: 1, measuredDurations: 2, elapsedMs: 40 }])
    expect(report.calls.map(row => [row.callSeq, row.resultSeq, row.explicitError, row.elapsedMs])).toEqual([
      [0, 3, false, 30], [1, 2, true, 10], [4, null, null, null], [5, 6, false, null],
    ])
    expect(report).toMatchObject({ capturedThroughSeq: 7, inheritedEventCount: 2, unmatchedResults: 1 })
    expect(JSON.stringify(report)).not.toContain('not copied')
  })

  it('does not mistake recovery markers or compacted result replacements for tool execution results', () => {
    const recovered = result(1, 'pending', true)
    recovered.data.error = { name: 'ToolOutcomeUnknownError', code: 'TOOL_OUTCOME_UNKNOWN' }
    const notStarted = result(2, 'never-started', true)
    notStarted.data.error = { name: 'ToolNotStartedError', code: 'TOOL_NOT_STARTED' }
    const replacement = result(5, 'finished', true)
    replacement.surfaceOp = { op: 'replace', startSeq: SessionSeq(4), endSeq: SessionSeq(4) }
    const report = analyze([call(0, 'pending'), recovered, notStarted, call(3, 'finished'), result(4, 'finished'), replacement])
    expect(report.tools[0]).toMatchObject({ calls: 2, completed: 1, explicitErrors: 0, unfinished: 1, measuredDurations: 1, elapsedMs: 10 })
    expect(report.calls[0]).toMatchObject({ resultSeq: null, recoverySeq: 1, explicitError: null, elapsedMs: null })
    expect(report).toMatchObject({ recoveryResults: 2, unmatchedResults: 0 })
  })

  it('does not pair the same provider call ID from different turns or silently resolve an ambiguous open call', () => {
    const report = analyze([call(0, 'same'), call(1, 'same', 'fs', 10, 2), result(2, 'same', false, 20, 2)])
    expect(report.calls.map(row => row.resultSeq)).toEqual([null, 2])
    expect(() => analyze([call(0, 'same'), call(1, 'same')])).toThrow('Ambiguous')
  })

  it('retains field-level unknowns, explicit zeros and disjoint token buckets without estimating totals or costs', () => {
    const report = analyze([message(0, 1, { inputTokens: 10, outputTokens: 4, cacheReadTokens: 0, totalTokens: 14 }),
      message(1, 2, { inputTokens: 7, outputTokens: 6, cacheReadTokens: 20, reasoningTokens: 3 }), message(2, 3)])
    expect(report.usageTotals).toEqual({
      inputTokens: { knownSum: 17, reported: 2, missing: 1 }, outputTokens: { knownSum: 10, reported: 2, missing: 1 },
      totalTokens: { knownSum: 14, reported: 1, missing: 2 }, cacheReadTokens: { knownSum: 20, reported: 2, missing: 1 },
      cacheWriteTokens: { knownSum: null, reported: 0, missing: 3 }, reasoningTokens: { knownSum: 3, reported: 1, missing: 2 },
    })
    expect(report.usage[2]?.usage).toBeNull()
    expect(report.usage[0]?.usage?.cacheWriteTokens).toBeUndefined()
    expect(analyze([]).usageTotals.inputTokens).toEqual({ knownSum: null, reported: 0, missing: 0 })
  })

  it('uses the final stream usage, replaces repeated settlements and counts retried attempts independently', () => {
    const attempt: SessionEvent<'assistant/attempt'> = { type: 'assistant/attempt', seq: SessionSeq(0), time: 0,
      data: { turn: 1, step: 1, stream: [
        { type: 'chunk', time: 0, chunk: { type: 'usage', usage: { inputTokens: 2, outputTokens: 1 } } },
        { type: 'chunk', time: 1, chunk: { type: 'usage', usage: { inputTokens: 3, outputTokens: 2 } } },
      ] } }
    const replacement = message(1, 1, { inputTokens: 5, outputTokens: 3 })
    const retry: SessionEvent<'llm/retry-started'> = { type: 'llm/retry-started', seq: SessionSeq(2), time: 2,
      data: { turn: 1, step: 1, retry: 1, retryId: brandString<RetryId>('retry') } }
    expect(analyze([attempt]).usage[0]?.usage).toEqual({ inputTokens: 3, outputTokens: 2 })
    const report = analyze([attempt, replacement, retry, message(3, 1, { inputTokens: 8, outputTokens: 4 }), message(4, 1)])
    expect(report.usage.map(record => record.seq)).toEqual([1, 3])
    expect(report.usageTotals.inputTokens).toEqual({ knownSum: 13, reported: 2, missing: 0 })
    expect(report.usageTotals.outputTokens.knownSum).toBe(7)
  })

  it('bounds detail rows while retaining totals across every captured event', () => {
    const events: SessionEvent[] = []
    for (let index = 0; index < 105; index++) {
      events.push(call(events.length, `${index}`), result(events.length + 1, `${index}`), message(events.length + 2, index, { inputTokens: 1, outputTokens: 2 }))
    }
    const report = analyze(events)
    expect(report.calls).toHaveLength(100)
    expect(report.usage).toHaveLength(100)
    expect(report).toMatchObject({ omittedCalls: 5, omittedUsage: 5, capturedThroughSeq: 314 })
    expect(report.tools[0]).toMatchObject({ calls: 105, completed: 105 })
    expect(report.usageTotals.inputTokens).toEqual({ knownSum: 105, reported: 105, missing: 0 })
  })

  it('retains errors, unfinished calls and the largest measurements beyond the detail window', () => {
    const events: SessionEvent[] = []
    for (let index = 0; index < 110; index++) {
      const seq = events.length
      events.push(call(seq, `${index}`), result(seq + 1, `${index}`, index >= 100, seq * 10 + index),
        message(seq + 2, index, { inputTokens: index, outputTokens: 2, totalTokens: index + 2 }))
    }
    events.push(call(330, 'pending'))
    const recovered = result(331, 'pending', true)
    recovered.data.error = { name: 'ToolOutcomeUnknownError', code: 'TOOL_OUTCOME_UNKNOWN' }
    events.push(recovered)
    const report = analyze(events)
    expect(report.calls.at(-1)?.callSeq).toBe(297)
    expect(report.usage.at(-1)?.seq).toBe(299)
    expect(report.highlights.errors.map(row => row.callSeq)).toEqual([300, 303, 306, 309, 312])
    expect(report.highlights.unfinished).toEqual([{ callId: 'pending', name: 'shell', callSeq: 330,
      resultSeq: null, recoverySeq: 331, explicitError: null, elapsedMs: null }])
    expect(report.highlights.slowest.map(row => row.callSeq)).toEqual([327, 324, 321, 318, 315])
    expect(report.highlights.largestUsage.map(row => row.seq)).toEqual([329, 326, 323, 320, 317])
    expect(historyAnalysisSchema.parse(report)).toEqual(report)
  })

  it('ranks only reported measurements, preserves zeros and resolves ties in log order', () => {
    const report = analyze([call(0, 'clock'), result(1, 'clock', false, -1), call(2, 'zero'), result(3, 'zero', false, 20),
      message(4, 1, { inputTokens: 1000, outputTokens: 500 }),
      message(5, 2, { inputTokens: 4, outputTokens: 1, totalTokens: 5 }),
      message(6, 3, { inputTokens: 4, outputTokens: 1, totalTokens: 5 }),
      message(7, 4, { inputTokens: 0, outputTokens: 0, totalTokens: 0 }), message(8, 5)])
    expect(report.highlights.slowest.map(row => [row.callId, row.elapsedMs])).toEqual([['zero', 0]])
    expect(report.highlights.largestUsage.map(row => row.seq)).toEqual([5, 6, 7])
    expect(report.usageTotals.totalTokens).toEqual({ knownSum: 10, reported: 3, missing: 2 })
    expect(analyze([]).highlights).toEqual({ errors: [], unfinished: [], slowest: [], largestUsage: [] })
  })
})
