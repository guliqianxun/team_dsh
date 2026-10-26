/** Owner-only task operations exposed through the DSH Gateway. */
import { Service, type Context } from '@deepseek-ai/cordis'
import { bindTypertRemote, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import { taskApiRequestSchema, type TaskApiRequest, type TaskApiResult } from '../shared/task.js'
import { TaskStoreError, type TaskStore } from './store.js'
import type {} from './conversation.js'

declare module '@deepseek-ai/cordis' {
  interface Context { teamDshTaskApi: TaskApi; teamDshTaskStore: TaskStore }
}

/** Admitted writes finish even when the caller disconnects. */
export class TaskApi {
  static readonly remote: TypertContribution = {
    package: 'team-dsh/task-api', face: 'host', schemas: [], model: { services: [], events: [], objects: [] },
    invocations: [{ id: 'team-dsh/task-api#request', service: 'teamDshTaskApi', namespace: 'teamDshTaskApi', method: 'request',
      invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'src-json' } }],
      cancellation: { parameter: 'signal' }, result: { mode: 'src-json' } }],
  }
  readonly [Service.tracker] = { associate: 'teamDshTaskApi', property: 'ctx' }
  readonly typertRemote = bindTypertRemote(this, 'teamDshTaskApi')
  private readonly active = new Set<Promise<TaskApiResult>>()
  private closing = false
  private disposal: Promise<void> | undefined
  /** @param ctx - Host invocation context. @param store - Retained task storage. */
  constructor(readonly ctx: Context, private readonly store: TaskStore) {}

  /** @param request - JSON request. @param signal - Cancellation checked before admission. @returns Acknowledged task facts or a localized error code. */
  @Remote
  request(request: unknown, signal: AbortSignal): Promise<TaskApiResult> {
    if (this.ctx.invocation?.peer.principal.kind !== 'owner') return Promise.resolve({ ok: false, error: { code: 'forbidden' } })
    if (this.closing) return Promise.resolve({ ok: false, error: { code: 'closed' } })
    if (signal.aborted) return Promise.resolve({ ok: false, error: { code: 'cancelled' } })
    const parsed = taskApiRequestSchema.safeParse(request)
    if (!parsed.success) return Promise.resolve({ ok: false, error: { code: 'invalid-request' } })
    if (parsed.data.kind !== 'list' && parsed.data.storageId !== this.store.storageId) return Promise.resolve({ ok: false, error: { code: 'wrong-storage' } })
    const result = this.perform(parsed.data)
    this.active.add(result)
    void result.then(() => this.active.delete(result), () => this.active.delete(result))
    return result
  }

  /** Refuse new requests and drain admitted work. @returns Shared drain completion. */
  close(): Promise<void> {
    this.closing = true
    return this.disposal ??= Promise.allSettled([...this.active]).then(() => {})
  }

  private async perform(request: TaskApiRequest): Promise<TaskApiResult> {
    try {
      const storageId = this.store.storageId
      switch (request.kind) {
        case 'list': return { ok: true, storageId, value: { kind: 'list', tasks: this.store.list() } }
        case 'create': return { ok: true, storageId, value: { kind: 'task', task: await this.store.create(request.requestId, request.text) } }
        case 'set-done': return { ok: true, storageId, value: { kind: 'task', task: await this.store.setDone(request.taskId, request.done) } }
        case 'open': {
          const conversations = this.ctx.get('teamDshTaskConversations')
          if (conversations === undefined) throw new TaskStoreError('session-unavailable')
          return { ok: true, storageId, value: { kind: 'task', task: await conversations.open(request.taskId) } }
        }
      }
    } catch (error) {
      if (error instanceof TaskStoreError) return { ok: false, error: { code: error.code } }
      this.ctx.logger.error('Task operation failed.', error)
      return { ok: false, error: { code: 'storage-unavailable' } }
    }
  }
}
