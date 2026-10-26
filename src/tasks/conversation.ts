/** Open the task's saved native Session without sending user or plugin messages. */
import { Service, type Context } from '@deepseek-ai/cordis'
import type { SessionCreateRequest, SessionCreateValue } from '@deepseek-ai/dsh-api-session-controller/types'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-working-directory'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Task, TaskId } from '../shared/task.js'
import { TaskStoreError, type TaskStore, type TaskBinding } from './store.js'

declare module '@deepseek-ai/cordis' {
  interface Context { teamDshTaskConversations: TaskConversations }
}

/** Empty Session creation is serialized per task and drained before dependencies are released. */
export class TaskConversations {
  readonly [Service.tracker] = { associate: 'teamDshTaskConversations', property: 'ctx' }
  private closing = false
  private disposal: Promise<void> | undefined
  private readonly pending = new Map<TaskId, Promise<Task>>()
  private readonly controller: { create(request: SessionCreateRequest): Promise<SessionCreateValue> }
  private readonly sessions: Context['sessions']
  private readonly persistence: Context['sessionPersistence']
  private readonly directory: string

  /** @param ctx - Retained DSH Session services. @param store - Task storage retained until setup drains. */
  constructor(readonly ctx: Context, private readonly store: TaskStore) {
    this.controller = ctx.get('sessionController')
    this.sessions = ctx.sessions
    this.persistence = ctx.sessionPersistence
    this.directory = ctx.workingDirectory.defaultDirectory
  }

  /** @param taskId - Task to open. @returns Task with the same ready Session, without calling prompt. */
  open(taskId: TaskId): Promise<Task> {
    if (this.closing) return Promise.reject(new TaskStoreError('closed'))
    const previous = this.pending.get(taskId)
    const result = (previous?.then(() => {}, () => {}) ?? Promise.resolve()).then(() => this.ensure(taskId))
    this.pending.set(taskId, result)
    const finished = () => { if (this.pending.get(taskId) === result) this.pending.delete(taskId) }
    void result.then(finished, finished)
    return result
  }

  /** Stop new opens and retain dependencies until setup finishes. @returns Shared close completion. */
  close(): Promise<void> {
    this.closing = true
    return this.disposal ??= Promise.allSettled([...this.pending.values()]).then(() => {})
  }

  private async ensure(taskId: TaskId): Promise<Task> {
    try {
      const binding = await this.store.reserve(taskId, this.directory)
      if (binding.mode !== 'native' && binding.state !== 'ready') throw new TaskStoreError('legacy-pending')
      const persisted = await this.persistence.stat(binding.sessionId)
      const live = this.sessions.get(binding.sessionId)
      if (persisted !== undefined) this.checkIdentity(binding, persisted.header)
      if (live !== undefined) this.checkIdentity(binding, live.header)
      if (binding.state === 'ready') {
        if (persisted === undefined) throw new TaskStoreError('session-missing')
        return this.store.present(this.store.get(taskId))
      }
      if (!persisted && !live) {
        const created = await this.controller.create({ sessionId: binding.sessionId, cwd: binding.cwd })
        if (created.sessionId !== binding.sessionId) throw new TaskStoreError('session-unavailable')
      }
      const attached = this.sessions.get(binding.sessionId)
      if (attached !== undefined) {
        this.checkIdentity(binding, attached.header)
        if (!await this.sessions.flush(attached)) throw new TaskStoreError('session-unavailable')
      } else if (persisted === undefined) throw new TaskStoreError('session-unavailable')
      const confirmed = await this.persistence.stat(binding.sessionId)
      if (confirmed === undefined) throw new TaskStoreError('session-unavailable')
      this.checkIdentity(binding, confirmed.header)
      return await this.store.ready(taskId, binding.sessionId)
    } catch (error) {
      if (error instanceof TaskStoreError) throw error
      throw new TaskStoreError('session-unavailable', error)
    }
  }

  private checkIdentity(binding: TaskBinding, header: { id: SessionId; cwd?: string }): void {
    if (binding.sessionId !== header.id || binding.cwd !== header.cwd) throw new TaskStoreError('session-unavailable')
  }
}
