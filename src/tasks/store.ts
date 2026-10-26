/** Task edits preserve earlier fields and sealed execution/review JSON in the same domain. */
import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { taskIdSchema, taskStorageIdSchema, sessionIdSchema, type Task, type TaskId, type TaskStorageId, type TaskErrorCode } from '../shared/task.js'

const bindingSchema = z.looseObject({
  sessionId: sessionIdSchema, cwd: z.string().min(1), state: z.enum(['reserved', 'created', 'ready']),
  mode: z.literal('native').optional(),
})
const storedTaskSchema = z.looseObject({
  taskId: taskIdSchema, title: z.string().min(1), status: z.enum(['todo', 'in_progress', 'done']),
  creationRequestId: z.string().min(1), creationText: z.string().optional(), goal: z.string().optional(),
  statusRevision: z.number().int().nonnegative().optional(), mainSession: bindingSchema.nullable().optional(),
})
/** Fields needed for task edits; unexposed earlier properties remain stored verbatim. */
export type StoredTask = z.infer<typeof storedTaskSchema>
/** Existing ready bindings are reusable; pending legacy submissions are never sent. */
export type TaskBinding = z.infer<typeof bindingSchema>

/** Keep both historical tables declared because single-file storage republishes all declared tables. */
export const taskDomainSpec = defineDomain({
  name: 'team_dsh_tasks', version: 1, layout: 'single',
  global: { schema: z.looseObject({ storageId: taskStorageIdSchema.nullable() }), initial: { storageId: null } },
  tables: {
    tasks: domainTable<TaskId, StoredTask>(storedTaskSchema),
    executions: domainTable<string, z.infer<ReturnType<typeof z.json>>>(z.json()),
    reviews: domainTable<string, z.infer<ReturnType<typeof z.json>>>(z.json()),
  },
})

/** A failed write blocks further use until storage is reopened and reread. */
export class TaskStoreError extends Error {
  /** @param code - Public failure category. @param cause - Host-only diagnostic cause. */
  constructor(readonly code: TaskErrorCode, cause?: unknown) {
    super(`Task operation: ${code}`, cause === undefined ? undefined : { cause })
    this.name = 'TaskStoreError'
  }
}

/** One store serializes mutations while DSH owns the associated Sessions. */
export class TaskStore {
  private chain: Promise<void> = Promise.resolve()
  private closing = false
  private failure: TaskStoreError | undefined
  private disposal: Promise<void> | undefined
  private constructor(private readonly domain: Domain<typeof taskDomainSpec>, readonly storageId: TaskStorageId,
    private readonly requests: Map<string, TaskId>) {}

  /** @param ctx - Host with storageDomain. @returns Open store; its owner must close it after consumers drain. */
  static async open(ctx: Context): Promise<TaskStore> {
    const domain = await ctx.storageDomain.open(taskDomainSpec)
    try {
      const requests = new Map<string, TaskId>()
      const sessions = new Set<SessionId>()
      for (const [key, task] of domain.table('tasks').entries()) {
        const binding = task.mainSession
        if (key !== task.taskId || requests.has(task.creationRequestId)
          || binding != null && (!isAbsolute(binding.cwd) || sessions.has(binding.sessionId))) {
          throw new TaskStoreError('storage-unavailable')
        }
        requests.set(task.creationRequestId, key)
        if (binding != null) sessions.add(binding.sessionId)
      }
      let storageId = domain.global.get().storageId
      if (storageId === null) {
        storageId = brandString<TaskStorageId>(randomUUID())
        await domain.global.set({ ...domain.global.get(), storageId })
      }
      return new TaskStore(domain, storageId, requests)
    } catch (error) {
      try { await domain.close() } catch (closeError) {
        throw new AggregateError([error, closeError], 'Task storage could not open or close.')
      }
      throw error
    }
  }

  /** @returns Saved tasks without execution state or inferred completion. */
  list(): Task[] {
    this.assertReadable()
    return [...this.domain.table('tasks').entries()].map(([, task]) => this.present(task))
  }

  /** @param taskId - Saved task identity. @returns Detached retained fields for Session binding. */
  get(taskId: TaskId): StoredTask {
    this.assertReadable()
    return structuredClone(this.require(taskId))
  }

  /** @param requestId - Stable creation intent. @param text - Normalized task name. @returns Original or newly saved task. */
  create(requestId: string, text: string): Promise<Task> {
    return this.enqueue(async () => {
      const existingId = this.requests.get(requestId)
      if (existingId !== undefined) {
        const existing = this.require(existingId)
        if ((existing.creationText ?? existing.goal ?? existing.title) !== text) throw new TaskStoreError('request-conflict')
        return this.present(existing)
      }
      const task: StoredTask = { taskId: brandString<TaskId>(randomUUID()), title: text,
        status: 'todo', statusRevision: 0, mainSession: null, creationRequestId: requestId,
        creationText: text, createdAt: new Date().toISOString() }
      await this.persist(task)
      this.requests.set(requestId, task.taskId)
      return this.present(task)
    })
  }

  /** @param taskId - Task selected by the user. @param done - Explicit completion choice. @returns Acknowledged task state. */
  setDone(taskId: TaskId, done: boolean): Promise<Task> {
    return this.enqueue(async () => {
      const task = this.require(taskId)
      if ((task.status === 'done') === done) return this.present(task)
      const revision = task.statusRevision ?? 0
      if (revision >= Number.MAX_SAFE_INTEGER) throw new TaskStoreError('storage-unavailable')
      const updated: StoredTask = { ...task, status: done ? 'done' : 'todo', statusRevision: revision + 1 }
      await this.persist(updated)
      return this.present(updated)
    })
  }

  /** @param taskId - Task to open. @param cwd - Directory for an empty new Session. @returns Fixed saved binding, before Session creation. */
  reserve(taskId: TaskId, cwd: string): Promise<TaskBinding> {
    return this.enqueue(async () => {
      const task = this.require(taskId)
      if (task.mainSession != null) return structuredClone(task.mainSession)
      if (!isAbsolute(cwd)) throw new TaskStoreError('session-unavailable')
      const binding: TaskBinding = { mode: 'native', sessionId: brandString<SessionId>(randomUUID()), cwd, state: 'reserved' }
      await this.persist({ ...task, mainSession: binding })
      return structuredClone(binding)
    })
  }

  /** @param taskId - Owner of the reserved Session. @param sessionId - Identity whose persistence was confirmed. @returns Task with its ready binding. */
  ready(taskId: TaskId, sessionId: SessionId): Promise<Task> {
    return this.enqueue(async () => {
      const task = this.require(taskId)
      const binding = task.mainSession
      if (binding == null || binding.sessionId !== sessionId) throw new TaskStoreError('session-unavailable')
      if (binding.state === 'ready') return this.present(task)
      if (binding.mode !== 'native') throw new TaskStoreError('legacy-pending')
      const updated: StoredTask = { ...task, mainSession: { ...binding, state: 'ready' } }
      await this.persist(updated)
      return this.present(updated)
    })
  }

  /** Stop admission, drain writes, then release the domain. @returns Shared close completion. */
  close(): Promise<void> {
    this.closing = true
    return this.disposal ??= this.chain.then(() => this.domain.close())
  }

  /** @param task - Saved record. @returns Only fields used by the task panel. */
  present(task: StoredTask): Task {
    return { taskId: task.taskId, title: task.title, done: task.status === 'done', sessionId: task.mainSession?.sessionId ?? null }
  }

  private require(taskId: TaskId): StoredTask {
    const task = this.domain.table('tasks').get(taskId)
    if (task === undefined) throw new TaskStoreError('task-not-found')
    return task
  }
  private assertReadable(): void {
    if (this.closing) throw new TaskStoreError('closed')
    if (this.failure !== undefined) throw this.failure
  }
  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    try { this.assertReadable() } catch (error) { return Promise.reject(error) }
    const result = this.chain.then(() => { if (this.failure !== undefined) throw this.failure; return run() })
    this.chain = result.then(() => {}, () => {})
    return result
  }
  private async persist(task: StoredTask): Promise<void> {
    try { await this.domain.table('tasks').put(task.taskId, task) } catch (error) {
      this.failure = new TaskStoreError('storage-unavailable', error)
      throw this.failure
    }
  }
}
