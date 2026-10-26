/** Tool pairing and provider usage accounting over one immutable native log observation. */
import { lastAssistantStreamChunk, type TokenUsage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-llm-retry/types'
import type { SessionObservation } from '@deepseek-ai/dsh-session-query'
import { TOOL_NOT_STARTED, TOOL_OUTCOME_UNKNOWN } from '@deepseek-ai/dsh-session'
import { usageFields, type HistoryAnalysis, type ToolCallFact, type UsageRecord } from '../shared/history.js'

/** Maximum evidence rows of each kind sent to the model per source; totals remain complete. */
const EVIDENCE_LIMIT = 100

// Each highlight category has five evidence slots; equal measurements retain log order.
function largest<T>(records: readonly T[], measure: (record: T) => number | null | undefined): T[] {
  return records.flatMap((record, index) => {
    const value = measure(record)
    return value == null ? [] : [{ record, value, index }]
  }).sort((a, b) => b.value - a.value || a.index - b.index).slice(0, 5).map(item => item.record)
}

/**
 * Read log facts without inspecting tool arguments, result content, or other Sessions.
 * Durations are result time minus call time, not exclusive execution time. Unknown
 * usage fields remain absent; reasoning tokens are never added to output tokens.
 * @param observation Caller-owned, replay-validated native observation.
 * @returns Detached measurements with event sequence numbers for native verification.
 */
export function analyzeHistory(observation: Pick<SessionObservation, 'header' | 'events' | 'cursor' | 'inheritedEventCount'>): HistoryAnalysis {
  const calls: ToolCallFact[] = []
  const pending = new Map<string, { fact: ToolCallFact; time: number }>()
  const usage: UsageRecord[] = []
  let lastUsage: UsageRecord | undefined
  let unmatchedResults = 0, recoveryResults = 0
  const key = (turn: number, step: number, callId: string) => JSON.stringify([turn, step, callId])
  for (const event of observation.events) {
    switch (event.type) {
      case 'tool/call': {
        const { turn, step, callId, name } = event.data
        const identity = key(turn, step, callId)
        if (pending.has(identity)) throw new Error('Ambiguous tool call identity in selected Session')
        const fact: ToolCallFact = { callId, name, callSeq: event.seq, resultSeq: null, recoverySeq: null, explicitError: null, elapsedMs: null }
        calls.push(fact)
        pending.set(identity, { fact, time: event.time })
        break
      }
      case 'tool/result': {
        // Surface replacements rewrite model context; they do not execute the tool again.
        if (event.surfaceOp !== 'append') break
        const { turn, step, message } = event.data
        const identity = key(turn, step, message.toolCallId)
        const call = pending.get(identity)
        if (event.data.error?.code === TOOL_OUTCOME_UNKNOWN || event.data.error?.code === TOOL_NOT_STARTED) {
          recoveryResults++
          if (call !== undefined) call.fact.recoverySeq = event.seq
          break
        }
        if (call === undefined) { unmatchedResults++; break }
        call.fact.resultSeq = event.seq
        call.fact.explicitError = message.isError === true
        const elapsed = event.time - call.time
        call.fact.elapsedMs = Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null
        pending.delete(identity)
        break
      }
      case 'llm/retry-started':
        if (lastUsage?.turn === event.data.turn && lastUsage.step === event.data.step) lastUsage = undefined
        break
      case 'assistant/message':
      case 'assistant/attempt': {
        // Use token-meter's durable sample selection and replacement/retry semantics.
        const sample: TokenUsage | undefined = (event.type === 'assistant/message' ? event.data.usage : undefined)
          ?? lastAssistantStreamChunk(event.data.stream, 'usage')?.usage
        const { turn, step } = event.data
        if (lastUsage?.turn === turn && lastUsage.step === step) {
          if (sample !== undefined || lastUsage.usage === null) {
            Object.assign(lastUsage, { seq: event.seq, kind: event.type, usage: sample === undefined ? null : { ...sample } })
          }
        } else {
          lastUsage = { seq: event.seq, turn, step, kind: event.type, usage: sample === undefined ? null : { ...sample } }
          usage.push(lastUsage)
        }
        break
      }
      default: break // Other native events contribute neither tool results nor provider usage.
    }
  }
  const summaries = new Map<string, HistoryAnalysis['tools'][number]>()
  for (const call of calls) {
    let summary = summaries.get(call.name)
    if (summary === undefined) {
      summary = { name: call.name, calls: 0, completed: 0, explicitErrors: 0, unfinished: 0, measuredDurations: 0, elapsedMs: null }
      summaries.set(call.name, summary)
    }
    summary.calls++
    if (call.resultSeq === null) summary.unfinished++
    else summary.completed++
    if (call.explicitError === true) summary.explicitErrors++
    if (call.elapsedMs !== null) { summary.measuredDurations++; summary.elapsedMs = (summary.elapsedMs ?? 0) + call.elapsedMs }
  }
  const bucket = (field: typeof usageFields[number]) => {
    let knownSum: number | null = null, reported = 0
    for (const record of usage) {
      const value = record.usage?.[field]
      if (value !== undefined) { knownSum = (knownSum ?? 0) + value; reported++ }
    }
    return { knownSum, reported, missing: usage.length - reported }
  }
  return {
    sessionId: observation.header.id, capturedThroughSeq: observation.cursor, inheritedEventCount: observation.inheritedEventCount,
    tools: [...summaries.values()], calls: calls.slice(0, EVIDENCE_LIMIT), omittedCalls: Math.max(0, calls.length - EVIDENCE_LIMIT),
    unmatchedResults, recoveryResults, usage: usage.slice(0, EVIDENCE_LIMIT), omittedUsage: Math.max(0, usage.length - EVIDENCE_LIMIT),
    usageTotals: { inputTokens: bucket('inputTokens'), outputTokens: bucket('outputTokens'), totalTokens: bucket('totalTokens'),
      cacheReadTokens: bucket('cacheReadTokens'), cacheWriteTokens: bucket('cacheWriteTokens'), reasoningTokens: bucket('reasoningTokens') },
    highlights: {
      errors: calls.filter(call => call.explicitError === true).slice(0, 5),
      unfinished: calls.filter(call => call.resultSeq === null).slice(0, 5),
      slowest: largest(calls, call => call.elapsedMs),
      largestUsage: largest(usage, record => record.usage?.totalTokens),
    },
  }
}
