/** One task list and one owned native conversation reference per plugin instance. */
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Task, TaskApiRequest, TaskApiResult, TaskErrorCode, TaskId, TaskStorageId } from '../shared/task.js'

type Write = Extract<TaskApiRequest, { kind: 'create' | 'set-done' }>
export type TaskIssue = TaskErrorCode | 'connection'

/** The page retains confirmed rows when a request fails. */
export interface TaskSnapshot {
  tasks: Task[] | null
  storageId: TaskStorageId | null
  draft: string
  connected: boolean
  loading: boolean
  saving: boolean
  pending: Write['kind'] | null
  error: TaskIssue | null
  selectedId: TaskId | null
  reference: SessionReference | null
  opening: boolean
  sessionError: TaskIssue | null
}

/** Only the apply closure talks to Host and acquires Session references. */
export interface TaskServices {
  connection: Pick<ConnectionHandle, 'generation'>
  request(request: TaskApiRequest, signal: AbortSignal): Promise<TaskApiResult>
  retain(sessionId: SessionId, signal: AbortSignal): SessionReference
  newRequestId(): string
}

/** Framework-bound reactive data and explicit page actions. */
export interface TaskFace {
  hooks: { tasks: ObservableSnapshot<TaskSnapshot> }
  setDraft(text: string): void
  createTask(): Promise<void>
  setDone(taskId: TaskId, done: boolean): Promise<void>
  refreshTasks(): Promise<void>
  retryWrite(): Promise<void>
  openTask(taskId: TaskId): Promise<void>
  back(): void
}

/** Own request cancellation, task navigation and the currently displayed Session. */
export class TaskController {
  readonly snapshot
  private active = false
  private closed = false
  private epoch = new AbortController()
  private navigation = 0
  private reads = 0
  private pending: Write | null = null
  private reference: SessionReference | null = null
  private opening: AbortController | null = null
  private readonly unsubscribe: () => void

  /** @param services Host transport and native Session ownership. */
  constructor(private readonly services: TaskServices) {
    this.snapshot = createSnapshotStore<TaskSnapshot>({ tasks: null, storageId: null, draft: '',
      connected: services.connection.generation.getSnapshot() !== undefined, loading: false, saving: false,
      pending: null, error: null, selectedId: null, reference: null, opening: false, sessionError: null })
    this.unsubscribe = services.connection.generation.subscribe(() => {
      this.epoch.abort(); this.epoch = new AbortController(); this.reads++
      this.release()
      this.snapshot.update(state => {
        state.connected = services.connection.generation.getSnapshot() !== undefined
        state.loading = false; state.saving = false
        if (this.pending) state.error = 'connection'
      })
      if (this.active && this.snapshot.getSnapshot().connected) void this.refresh()
    })
  }

  /** @returns Data and callbacks supplied to the panel registration. */
  face(): TaskFace {
    return { hooks: { tasks: this.snapshot }, setDraft: text => {
      if (!this.closed && this.pending?.kind !== 'create') this.snapshot.update(state => { state.draft = text })
    }, createTask: () => this.create(), setDone: (id, done) => this.setDone(id, done),
    refreshTasks: () => this.refresh(), retryWrite: () => this.retry(), openTask: id => this.open(id), back: () => this.back() }
  }

  /** Release hidden conversations; returning reads current tasks before reopening the selection.
   * @param active Whether the task panel is the selected main panel.
   */
  setActive(active: boolean): void {
    if (this.closed || this.active === active) return
    this.active = active
    if (active) void this.refresh()
    else { this.reads++; this.release(); this.snapshot.update(state => { state.loading = false }) }
  }

  /** Refresh confirmed task rows without creating a task or submitting chat input. */
  async refresh(): Promise<void> {
    if (!this.usable() || this.snapshot.getSnapshot().saving) return
    const read = ++this.reads
    const signal = this.epoch.signal
    this.snapshot.update(state => { state.loading = true; if (!this.pending) state.error = null })
    if (!this.current(signal) || !this.active || read !== this.reads) return
    try {
      const result = await this.services.request({ kind: 'list' }, signal)
      if (!this.current(signal) || !this.active || read !== this.reads) return
      if (!result.ok) { this.snapshot.update(state => { state.error = result.error.code }); return }
      if (result.value.kind !== 'list') throw new Error('Expected task list')
      const tasks = result.value.tasks
      const previous = this.snapshot.getSnapshot()
      const changedStorage = previous.storageId !== null && previous.storageId !== result.storageId
      const missingSelection = previous.selectedId !== null && !tasks.some(task => task.taskId === previous.selectedId)
      if (changedStorage || missingSelection) this.back()
      this.snapshot.update(state => { state.tasks = tasks
        state.storageId = result.storageId
        if (this.pending && this.pending.storageId !== result.storageId) state.error = 'wrong-storage'
      })
      const selected = this.snapshot.getSnapshot().selectedId
      if (selected && this.reference === null && this.opening === null && this.current(signal) && this.active) void this.open(selected)
    } catch (_error) {
      if (this.current(signal) && read === this.reads) this.snapshot.update(state => { state.error = 'connection' })
    } finally {
      if (this.current(signal) && read === this.reads) this.snapshot.update(state => { state.loading = false })
    }
  }

  /** Create from one line; a failed attempt retains the same request identity. */
  async create(): Promise<void> {
    const state = this.snapshot.getSnapshot()
    if (!this.usable() || state.saving || this.pending || state.storageId === null || !state.draft.trim()) return
    this.pending = { kind: 'create', storageId: state.storageId, requestId: this.services.newRequestId(), text: state.draft.trim() }
    await this.write()
  }

  /** @param taskId Existing task. @param done User-selected completion value. */
  async setDone(taskId: TaskId, done: boolean): Promise<void> {
    const state = this.snapshot.getSnapshot()
    if (!this.usable() || state.saving || this.pending || state.storageId === null || !state.tasks?.some(task => task.taskId === taskId)) return
    this.pending = { kind: 'set-done', storageId: state.storageId, taskId, done }
    await this.write()
  }

  /** Retry the original creation or absolute completion value, never a replacement request. */
  async retry(): Promise<void> { if (this.usable() && !this.snapshot.getSnapshot().saving && this.pending) await this.write() }

  private async write(): Promise<void> {
    const request = this.pending
    if (!request) return
    if (request.storageId !== this.snapshot.getSnapshot().storageId) {
      this.snapshot.update(state => { state.error = 'wrong-storage' }); return
    }
    this.reads++
    const signal = this.epoch.signal
    this.snapshot.update(state => { state.saving = true; state.loading = false; state.pending = request.kind; state.error = null })
    if (!this.current(signal) || this.pending !== request) return
    try {
      const result = await this.services.request(request, signal)
      if (!this.current(signal) || this.pending !== request) return
      if (!result.ok) { this.snapshot.update(state => { state.error = result.error.code }); return }
      if (result.storageId !== request.storageId) { this.snapshot.update(state => { state.error = 'wrong-storage' }); return }
      if (result.value.kind !== 'task') throw new Error('Expected saved task')
      if (request.kind === 'set-done' && result.value.task.taskId !== request.taskId) throw new Error('Unexpected task')
      this.adopt(result.value.task)
      this.pending = null
      this.snapshot.update(state => { state.pending = null; if (request.kind === 'create') state.draft = '' })
    } catch (_error) {
      if (this.current(signal) && this.pending === request) this.snapshot.update(state => { state.error = 'connection' })
    } finally {
      if (this.current(signal)) {
        this.snapshot.update(state => { state.saving = false })
        const selected = this.snapshot.getSnapshot().selectedId
        if (selected && this.active && this.reference === null && this.opening === null) void this.open(selected)
      }
    }
  }

  /** Open the exact task's native conversation; no input is filled or sent.
   * @param taskId Task selected by the user.
   */
  async open(taskId: TaskId): Promise<void> {
    const state = this.snapshot.getSnapshot()
    if (!this.usable() || state.storageId === null || !state.tasks?.some(task => task.taskId === taskId)) return
    this.release()
    const navigation = this.navigation
    const opening = new AbortController()
    this.opening = opening
    const signal = AbortSignal.any([this.epoch.signal, opening.signal])
    const current = () => this.current(signal) && this.active && this.navigation === navigation && this.opening === opening
    this.snapshot.update(value => { value.selectedId = taskId; value.opening = true; value.sessionError = null })
    if (!current()) return
    try {
      const result = await this.services.request({ kind: 'open', storageId: state.storageId, taskId }, signal)
      if (!current()) return
      if (!result.ok) { this.snapshot.update(value => { value.sessionError = result.error.code }); return }
      if (result.storageId !== state.storageId) { this.snapshot.update(value => { value.sessionError = 'wrong-storage' }); return }
      if (result.value.kind !== 'task' || result.value.task.taskId !== taskId || result.value.task.sessionId === null) throw new Error('Expected task conversation')
      const task = result.value.task
      this.snapshot.update(value => { value.tasks = value.tasks?.map(saved => saved.taskId === task.taskId ? { ...saved, sessionId: task.sessionId } : saved) ?? null })
      if (!current()) return
      const reference = this.services.retain(result.value.task.sessionId, signal)
      if (!current()) { reference.release(); return }
      this.reference = reference
      await reference.ready
      if (current() && this.reference === reference) this.snapshot.update(value => { value.reference = reference })
    } catch (_error) {
      if (current()) {
        this.reference?.release(); this.reference = null
        this.snapshot.update(value => { value.reference = null; value.sessionError = 'session-unavailable' })
      }
    } finally {
      if (current()) { this.opening = null; this.snapshot.update(value => { value.opening = false }) }
    }
  }

  /** Return to the list and release its conversation reference. */
  back(): void { this.release(); this.snapshot.update(state => { state.selectedId = null; state.sessionError = null }) }

  /** Stop new work and release pending or displayed conversation references. */
  dispose(): void {
    if (this.closed) return
    this.closed = true; this.active = false; this.unsubscribe(); this.epoch.abort(); this.release()
  }

  private usable(): boolean { return !this.closed && this.active && this.snapshot.getSnapshot().connected }
  private current(signal: AbortSignal): boolean { return !this.closed && !signal.aborted }
  private adopt(task: Task): void {
    this.snapshot.update(state => {
      const tasks = state.tasks ?? []
      state.tasks = tasks.some(value => value.taskId === task.taskId) ? tasks.map(value => value.taskId === task.taskId ? task : value) : [...tasks, task]
    })
  }
  private release(): void {
    this.navigation++; this.opening?.abort(); this.opening = null
    const reference = this.reference; this.reference = null
    this.snapshot.update(state => { state.reference = null; state.opening = false })
    reference?.release()
  }
}
