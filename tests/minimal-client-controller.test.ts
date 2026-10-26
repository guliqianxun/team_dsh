import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import { expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConnectionGeneration } from '@deepseek-ai/dsh-client-connection/client'
import type { SessionBinding, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { TaskController, type TaskServices } from '../src/client/controller.js'
import { taskSchema, taskStorageIdSchema, type Task, type TaskApiResult } from '../src/shared/task.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// The controller awaits native readiness but never reads binding internals.
const binding = {} as SessionBinding
class Reference implements SessionReference {
  readonly completion = deferred<SessionBinding>()
  readonly ready = this.completion.promise
  readonly binding = binding
  releases = 0
  constructor(readonly sessionId: SessionId) {}
  release() { this.releases++ }
  [Symbol.dispose]() { this.release() }
}
const storageId = taskStorageIdSchema.parse('test-store')
const taskA = taskSchema.parse({ taskId: 'a', title: 'First task', done: false, sessionId: null })
const taskB = taskSchema.parse({ taskId: 'b', title: 'Second task', done: false, sessionId: null })
const taskReply = (task: Task): TaskApiResult => ({ ok: true, storageId, value: { kind: 'task', task } })
const flush = async () => { await Promise.resolve(); await Promise.resolve() }

async function fixture() {
  const records = new Map([taskA, taskB].map(task => [task.taskId, { ...task }]))
  const creations = new Map<string, Task>()
  const generation = createSnapshotStore<ConnectionGeneration | undefined>({ id: 1, host: { home: '/test/dsh' } })
  const references: Reference[] = []
  const request = vi.fn<TaskServices['request']>(async input => {
    if (input.kind === 'list') return { ok: true, storageId, value: { kind: 'list', tasks: [...records.values()] } }
    if (input.kind === 'create') {
      const task = creations.get(input.requestId) ?? taskSchema.parse({ taskId: `new-${input.requestId}`, title: input.text, done: false, sessionId: null })
      creations.set(input.requestId, task); records.set(task.taskId, task)
      return taskReply(task)
    }
    const task = records.get(input.taskId)!
    const saved = input.kind === 'set-done' ? { ...task, done: input.done }
      : taskSchema.parse({ ...task, sessionId: task.sessionId ?? `session-${task.taskId}` })
    records.set(saved.taskId, saved)
    return taskReply(saved)
  })
  const retain = vi.fn<TaskServices['retain']>((id, _signal) => {
    const reference = new Reference(id); references.push(reference); return reference
  })
  const controller = new TaskController({ connection: { generation }, request, retain, newRequestId: () => 'creation-one' })
  controller.setActive(true)
  await controller.refresh()
  request.mockClear()
  return { controller, request, retain, records, creations, references, generation }
}

it('creates from one line and retries an unknown result with the original request', async () => {
  const f = await fixture()
  const actual = f.request.getMockImplementation()!
  f.request.mockImplementationOnce(async (input, signal) => { await actual(input, signal); throw new Error('response lost') })
  f.controller.face().setDraft('  A small task  ')
  await f.controller.create()
  expect(f.controller.snapshot.getSnapshot()).toMatchObject({ draft: '  A small task  ', pending: 'create', error: 'connection' })
  f.controller.face().setDraft('Do not replace the uncertain request')
  await f.controller.retry()
  expect(f.request.mock.calls.map(([input]) => input)).toEqual([
    { kind: 'create', storageId, requestId: 'creation-one', text: 'A small task' },
    { kind: 'create', storageId, requestId: 'creation-one', text: 'A small task' },
  ])
  expect(f.creations.size).toBe(1)
  expect(f.controller.snapshot.getSnapshot()).toMatchObject({ draft: '', pending: null, error: null, selectedId: null })
  expect(f.retain).not.toHaveBeenCalled()
  f.controller.dispose()
})

it('saves manual completion without preparing or sending a conversation', async () => {
  const f = await fixture()
  await f.controller.setDone(taskA.taskId, true)
  expect(f.controller.snapshot.getSnapshot().tasks?.find(task => task.taskId === taskA.taskId)?.done).toBe(true)
  expect(f.request.mock.calls.map(([input]) => input.kind)).toEqual(['set-done'])
  expect(f.retain).not.toHaveBeenCalled()
  f.controller.dispose()
})

it('keeps confirmed rows and completion when saving or reading fails', async () => {
  const f = await fixture()
  f.request.mockResolvedValueOnce({ ok: false, error: { code: 'storage-unavailable' } })
  await f.controller.setDone(taskA.taskId, true)
  expect(f.controller.snapshot.getSnapshot()).toMatchObject({ pending: 'set-done', error: 'storage-unavailable', tasks: [taskA, taskB] })
  await f.controller.retry()
  f.request.mockRejectedValueOnce(new Error('offline'))
  await f.controller.refresh()
  expect(f.controller.snapshot.getSnapshot()).toMatchObject({ error: 'connection', tasks: [{ ...taskA, done: true }, taskB] })
  f.controller.dispose()
})

it('ignores a late open response after switching to another task', async () => {
  const f = await fixture()
  const first = deferred<TaskApiResult>()
  f.request.mockImplementationOnce(() => first.promise)
  const openingA = f.controller.open(taskA.taskId)
  const openingB = f.controller.open(taskB.taskId)
  await flush()
  expect(f.references).toHaveLength(1)
  f.references[0]!.completion.resolve(binding)
  await openingB
  first.resolve(taskReply(taskSchema.parse({ ...taskA, sessionId: 'session-a' })))
  await openingA
  expect(f.controller.snapshot.getSnapshot()).toMatchObject({ selectedId: taskB.taskId, reference: f.references[0] })
  expect(f.retain).toHaveBeenCalledTimes(1)
  f.controller.dispose()
  expect(f.references[0]!.releases).toBe(1)
})

it('releases a not-yet-ready reference on back and ignores its later readiness', async () => {
  const f = await fixture()
  const opening = f.controller.open(taskA.taskId)
  await flush()
  const reference = f.references[0]!
  f.controller.back()
  expect(reference.releases).toBe(1)
  reference.completion.resolve(binding)
  await opening
  expect(f.controller.snapshot.getSnapshot()).toMatchObject({ selectedId: null, reference: null, opening: false })
  f.controller.dispose()
  expect(reference.releases).toBe(1)
})

it('releases a failed native reference and retries the same saved Session', async () => {
  const f = await fixture()
  const opening = f.controller.open(taskA.taskId)
  await flush()
  f.references[0]!.completion.reject(new Error('native open failed'))
  await opening
  expect(f.references[0]!.releases).toBe(1)
  expect(f.controller.snapshot.getSnapshot().sessionError).toBe('session-unavailable')
  const retry = f.controller.open(taskA.taskId)
  await flush()
  expect(f.references[1]!.sessionId).toBe(f.references[0]!.sessionId)
  f.references[1]!.completion.resolve(binding)
  await retry
  expect(f.controller.snapshot.getSnapshot().reference).toBe(f.references[1])
  f.controller.setActive(false)
  expect(f.references[1]!.releases).toBe(1)
  f.controller.dispose()
})

it('releases the old connection reference and reacquires only after fresh task data', async () => {
  const f = await fixture()
  const opening = f.controller.open(taskA.taskId)
  await flush(); f.references[0]!.completion.resolve(binding); await opening
  f.generation.set(undefined)
  expect(f.references[0]!.releases).toBe(1)
  expect(f.controller.snapshot.getSnapshot()).toMatchObject({ reference: null, connected: false })
  f.generation.set({ id: 2, host: { home: '/test/dsh' } })
  await flush(); await flush()
  expect(f.references).toHaveLength(2)
  f.references[1]!.completion.resolve(binding); await flush()
  expect(f.controller.snapshot.getSnapshot().reference).toBe(f.references[1])
  f.controller.dispose()
  expect(f.references[1]!.releases).toBe(1)
})

it('does not restore an older completion value from a delayed open response', async () => {
  const f = await fixture()
  const response = deferred<TaskApiResult>()
  f.request.mockImplementationOnce(() => response.promise)
  const opening = f.controller.open(taskA.taskId)
  await f.controller.setDone(taskA.taskId, true)
  response.resolve(taskReply(taskSchema.parse({ ...taskA, sessionId: 'session-a' })))
  await flush(); f.references[0]!.completion.resolve(binding); await opening
  expect(f.controller.snapshot.getSnapshot().tasks?.find(task => task.taskId === taskA.taskId)?.done).toBe(true)
  f.controller.dispose()
})

it('does not call Host when a synchronous opening observer disposes the controller', async () => {
  const f = await fixture()
  const unsubscribe = f.controller.snapshot.subscribe(() => {
    if (f.controller.snapshot.getSnapshot().opening) f.controller.dispose()
  })
  await f.controller.open(taskA.taskId)
  expect(f.request).not.toHaveBeenCalled()
  expect(f.retain).not.toHaveBeenCalled()
  unsubscribe()
})

it('does not acquire a reference when navigation leaves during the open response publication', async () => {
  const f = await fixture()
  const unsubscribe = f.controller.snapshot.subscribe(() => {
    if (f.controller.snapshot.getSnapshot().tasks?.some(task => task.sessionId !== null)) f.controller.setActive(false)
  })
  await f.controller.open(taskA.taskId)
  expect(f.retain).not.toHaveBeenCalled()
  unsubscribe(); f.controller.dispose()
})
