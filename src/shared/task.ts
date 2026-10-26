/** The task list owns names and completion; DSH owns the associated conversations. */
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { z } from 'zod'

export type TaskId = Branded<'TeamDshTaskId'>
export type TaskStorageId = Branded<'TeamDshTaskStorageId'>
export const taskIdSchema = z.string().min(1).transform(brandString<TaskId>)
export const taskStorageIdSchema = z.string().min(1).transform(brandString<TaskStorageId>)
export const sessionIdSchema = z.string().min(1).transform(brandString<SessionId>)

/** Only these fields are exposed by the minimal task panel. */
export const taskSchema = z.strictObject({
  taskId: taskIdSchema,
  title: z.string().min(1),
  done: z.boolean(),
  sessionId: sessionIdSchema.nullable(),
})
export type Task = z.infer<typeof taskSchema>

/** A creation retry keeps its requestId and text; opening never submits a message. */
export const taskApiRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('list') }),
  z.strictObject({ kind: z.literal('create'), storageId: taskStorageIdSchema,
    requestId: z.string().min(1), text: z.string().trim().min(1) }),
  z.strictObject({ kind: z.literal('set-done'), storageId: taskStorageIdSchema,
    taskId: taskIdSchema, done: z.boolean() }),
  z.strictObject({ kind: z.literal('open'), storageId: taskStorageIdSchema, taskId: taskIdSchema }),
])
export type TaskApiRequest = z.infer<typeof taskApiRequestSchema>

export const taskErrorCodeSchema = z.enum([
  'forbidden', 'closed', 'cancelled', 'invalid-request', 'wrong-storage', 'task-not-found',
  'request-conflict', 'storage-unavailable', 'session-unavailable', 'session-missing', 'legacy-pending',
])
export type TaskErrorCode = z.infer<typeof taskErrorCodeSchema>

/** Failures carry localized codes; neither failures nor reads imply a task is done. */
export const taskApiResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), storageId: taskStorageIdSchema,
    value: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('list'), tasks: z.array(taskSchema) }),
      z.strictObject({ kind: z.literal('task'), task: taskSchema }),
    ]) }),
  z.strictObject({ ok: z.literal(false), error: z.strictObject({ code: taskErrorCodeSchema }) }),
])
export type TaskApiResult = z.infer<typeof taskApiResultSchema>
