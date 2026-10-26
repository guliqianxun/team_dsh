/** Measured facts from explicitly selected Session logs; null means unreported. */
import { z } from 'zod'
import { sessionIdSchema } from './task.js'

const count = z.number().int().nonnegative()
const seq = count
export const historyRequestSchema = z.strictObject({
  sourceIds: z.array(sessionIdSchema).min(1).max(3).refine(ids => new Set(ids).size === ids.length),
})

const toolCallSchema = z.strictObject({
  callId: z.string(), name: z.string(), callSeq: seq, resultSeq: seq.nullable(), recoverySeq: seq.nullable(),
  explicitError: z.boolean().nullable(), elapsedMs: z.number().nonnegative().nullable(),
})
const toolSummarySchema = z.strictObject({
  name: z.string(), calls: count, completed: count, explicitErrors: count, unfinished: count,
  measuredDurations: count, elapsedMs: z.number().nonnegative().nullable(),
})
const usageSchema = z.strictObject({
  inputTokens: count, outputTokens: count, totalTokens: count.optional(),
  cacheReadTokens: count.optional(), cacheWriteTokens: count.optional(), reasoningTokens: count.optional(),
})
const usageRecordSchema = z.strictObject({
  seq, turn: count, step: count, kind: z.enum(['assistant/message', 'assistant/attempt']), usage: usageSchema.nullable(),
})
const bucketSchema = z.strictObject({ knownSum: count.nullable(), reported: count, missing: count })
export const usageFields = ['inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'] as const
export type UsageField = typeof usageFields[number]
const usageTotalsSchema = z.strictObject({
  inputTokens: bucketSchema, outputTokens: bucketSchema, totalTokens: bucketSchema,
  cacheReadTokens: bucketSchema, cacheWriteTokens: bucketSchema, reasoningTokens: bucketSchema,
})

/** Detail rows are bounded; totals cover the entire captured log, including inherited events. */
export const historyAnalysisSchema = z.strictObject({
  sessionId: sessionIdSchema, capturedThroughSeq: z.number().int().min(-1), inheritedEventCount: count,
  tools: z.array(toolSummarySchema), calls: z.array(toolCallSchema), omittedCalls: count,
  unmatchedResults: count, recoveryResults: count,
  usage: z.array(usageRecordSchema), omittedUsage: count, usageTotals: usageTotalsSchema,
  highlights: z.strictObject({
    errors: z.array(toolCallSchema).max(5), unfinished: z.array(toolCallSchema).max(5),
    slowest: z.array(toolCallSchema).max(5), largestUsage: z.array(usageRecordSchema).max(5),
  }),
})
export type HistoryAnalysis = z.infer<typeof historyAnalysisSchema>
export type ToolCallFact = HistoryAnalysis['calls'][number]
export type UsageRecord = HistoryAnalysis['usage'][number]

export const historyResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), sources: z.array(historyAnalysisSchema).min(1).max(3) }),
  z.strictObject({ ok: z.literal(false), error: z.enum(['forbidden', 'invalid-request', 'closed', 'cancelled', 'unavailable']) }),
])
export type HistoryResult = z.infer<typeof historyResultSchema>
