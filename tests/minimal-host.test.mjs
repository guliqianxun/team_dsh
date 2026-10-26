/** Real Gateway/storage and a Session service fixture; no model runtime is mounted. */
import { Context } from '@deepseek-ai/cordis'
import RemoteAccess from '@deepseek-ai/dsh-api-remote-access'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { JsonStorageBackend } from '@deepseek-ai/dsh-storage-json'
import Typert from '@deepseek-ai/dsh-typert-registry'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import * as teamDsh from '../src/index.js'
import { taskApiResultSchema } from '../src/shared/task.js'

function deferred() {
  let release
  const promise = new Promise(resolve => { release = resolve })
  return { promise, release }
}
function legacyDocument(cwd) {
  const tasks = Object.fromEntries(Array.from({ length: 11 }, (_, index) => {
    const taskId = `task-${index}`
    const mainSession = index < 6 ? { sessionId: randomUUID(), cwd, state: 'ready',
      ...(index < 4 ? { requestId: `first-${index}`, text: 'Earlier input', prompt: 'Earlier prompt' } : { mode: 'native' }) } : null
    return [taskId, { taskId, title: `Task ${index}`, status: index === 1 ? 'done' : 'todo', statusRevision: 3,
      creationRequestId: `create-${index}`, creationText: `Task ${index}`, mainSession,
      goal: 'Retained requirements', acceptanceCriteria: 'Retained criteria', goalRevision: 2, titleRevision: 0,
      retained: { array: [null, { unknown: true }] } }]
  }))
  return { unit: { name: 'team_dsh_tasks', version: 1 }, global: { storageId: 'fixture-store', retained: { global: true } },
    tables: { tasks, executions: { archived: { arbitrary: ['not', 'interpreted', 2] } }, reviews: { archived: [null, false, { report: 'Retained' }] } } }
}
async function fixture({ seed, sessions = false, persistBindings = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'team-dsh-minimal-'))
  const ctx = new Context()
  const releases = []
  onTestFinished(async () => {
    for (const release of releases) release()
    try { await ctx.fiber.dispose() } finally { await rm(root, { recursive: true, force: true }) }
  })
  const workspace = join(root, 'workspace')
  await mkdir(workspace)
  const path = join(root, 'team_dsh_tasks.json')
  const original = seed?.(workspace)
  if (original) await writeFile(path, JSON.stringify(original))
  const writes = {}
  await ctx.plugin(Storage)
  await ctx.plugin({ inject: ['storage'], async apply(scope) {
    await scope.effect(function* () {
      const disk = new JsonStorageBackend(root)
      yield () => disk.close()
      const backend = { kv: { async open(descriptor) {
        const unit = await disk.kv.open(descriptor)
        return { loadAll: () => unit.loadAll(), close: () => unit.close(), setGlobal: value => unit.setGlobal(value),
          deleteRecord: (table, key) => unit.deleteRecord(table, key),
          putRecord: (table, key, value) => {
            const commit = () => unit.putRecord(table, key, value)
            return writes.intercept ? writes.intercept(value, commit) : commit()
          } }
      } }, close: () => disk.close() }
      yield scope.storage.backend.register('fixture', backend)
      const domains = new DomainFacility(scope, { backend: 'fixture' })
      yield scope.provide('storageDomain', domains)
      yield () => domains.closeAll()
    })
  } })
  await ctx.plugin(Typert)
  await ctx.plugin(RemoteAccess)
  await ctx.plugin(Gateway)
  if (sessions) {
    const live = new Map(), persisted = new Map()
    const controller = {
      create: async request => {
        live.set(request.sessionId, { header: { id: request.sessionId, cwd: request.cwd } })
        return { sessionId: request.sessionId }
      },
      prompt: async () => { throw new Error('Task opening must not submit a prompt') },
    }
    ctx.effect(() => ctx.provide('sessionController', controller))
    ctx.effect(() => ctx.provide('sessions', {
      get: sessionId => live.get(sessionId),
      flush: vi.fn(async session => { persisted.set(session.header.id, { header: structuredClone(session.header) }); return true }),
    }))
    ctx.effect(() => ctx.provide('sessionPersistence', { stat: async sessionId => structuredClone(persisted.get(sessionId)) }))
    ctx.effect(() => ctx.provide('workingDirectory', { defaultDirectory: workspace }))
    if (original && persistBindings) {
      for (const task of Object.values(original.tables.tasks)) {
        if (task.mainSession?.state !== 'ready') continue
        persisted.set(task.mainSession.sessionId, { header: { id: task.mainSession.sessionId, cwd: task.mainSession.cwd } })
      }
    }
  }
  const plugin = await ctx.plugin(teamDsh)
  const storageId = ctx.teamDshTaskStore.storageId
  const signal = new AbortController().signal
  const peer = { id: randomUUID(), ctx, principal: { kind: 'owner' }, signal, interactions: 'none', dispose: async () => {} }
  const call = async (request, selectedPeer = peer) => taskApiResultSchema.parse(await ctx.typertGateway.invoke({
    namespace: 'teamDshTaskApi', method: 'request', args: { request: request.kind === 'list' ? request : { storageId, ...request } },
    peer: selectedPeer, signal,
  }))
  const create = async (text = 'A task', requestId = randomUUID()) => {
    const reply = await call({ kind: 'create', requestId, text })
    expect(reply.ok).toBe(true)
    return reply.value.task
  }
  return { ctx, plugin, root, path, workspace, storageId, original, call, create, peer, writes, releases,
    read: async () => JSON.parse(await readFile(path, 'utf8')) }
}

// Inputs and snapshots use synthetic tasks; existing user storage is never opened by tests.
describe('minimal task Host', () => {
  it('reads eleven earlier tasks and preserves every unedited field and sealed table on manual completion', async () => {
    const f = await fixture({ seed: legacyDocument })
    expect(await readFile(f.path, 'utf8')).toBe(JSON.stringify(f.original))
    const listed = await f.call({ kind: 'list' })
    expect(listed.value.tasks).toHaveLength(11)
    expect(listed.value.tasks.filter(task => task.sessionId !== null)).toHaveLength(6)
    expect(Object.keys(listed.value.tasks[0])).toEqual(['taskId', 'title', 'done', 'sessionId'])
    await f.call({ kind: 'set-done', taskId: 'task-0', done: true })
    const after = await f.read()
    expect(after).toEqual({ ...f.original, tables: { ...f.original.tables, tasks: { ...f.original.tables.tasks,
      'task-0': { ...f.original.tables.tasks['task-0'], status: 'done', statusRevision: 4 } } } })
    expect(f.ctx.get('sessions')).toBeUndefined()
    expect(await f.call({ kind: 'open', taskId: 'task-0' })).toEqual({ ok: false, error: { code: 'session-unavailable' } })
  })

  it('replays concurrent creation by request identity and saves manual done/reopen across reload', async () => {
    const f = await fixture()
    const request = { kind: 'create', requestId: randomUUID(), text: '  Capture work  ' }
    const [first, repeated] = await Promise.all([f.call(request), f.call(request)])
    expect(repeated).toEqual(first)
    expect(first.value.task).toMatchObject({ title: 'Capture work', done: false, sessionId: null })
    expect(await f.call({ ...request, text: 'Different' })).toEqual({ ok: false, error: { code: 'request-conflict' } })
    const taskId = first.value.task.taskId
    const [done, reopened] = await Promise.all([
      f.call({ kind: 'set-done', taskId, done: true }), f.call({ kind: 'set-done', taskId, done: false }),
    ])
    expect(done.value.task.done).toBe(true)
    expect(reopened.value.task.done).toBe(false)
    expect((await f.read()).tables.tasks[taskId].statusRevision).toBe(2)
    await f.plugin.dispose()
    await f.ctx.plugin(teamDsh)
    expect(await f.call(request)).toEqual(reopened)
    expect((await f.call({ kind: 'list' })).value.tasks).toEqual([reopened.value.task])
  })

  it('rejects non-owner, foreign storage and invalid requests without writing', async () => {
    const f = await fixture()
    f.ctx.effect(() => f.ctx.remoteAccess.registerPolicy('minimalGuest', { bindings: () => [{ resource: { kind: 'global' },
      role: { name: 'fixture', resource: 'global', actions: ['teamDshTaskApi/request'] } }] }))
    const before = await readFile(f.path, 'utf8')
    expect(await f.call({ kind: 'create', requestId: 'guest', text: 'Denied' }, { ...f.peer, principal: { kind: 'minimalGuest' } }))
      .toEqual({ ok: false, error: { code: 'forbidden' } })
    expect(await f.call({ kind: 'create', requestId: 'wrong', text: 'Denied', storageId: 'foreign' }))
      .toEqual({ ok: false, error: { code: 'wrong-storage' } })
    expect(await f.call({ kind: 'create', requestId: 'invalid', text: '   ' })).toEqual({ ok: false, error: { code: 'invalid-request' } })
    expect(await readFile(f.path, 'utf8')).toBe(before)
  })

  it('reserves once before native creation, opens one empty durable Session and reuses it after reload', async () => {
    const f = await fixture({ sessions: true })
    const task = await f.create()
    const prompt = vi.spyOn(f.ctx.sessionController, 'prompt')
    const nativeCreate = f.ctx.sessionController.create.bind(f.ctx.sessionController)
    const create = vi.spyOn(f.ctx.sessionController, 'create').mockImplementation(async request => {
      expect((await f.read()).tables.tasks[task.taskId].mainSession).toMatchObject({ state: 'reserved', sessionId: request.sessionId })
      return nativeCreate(request)
    })
    const [first, repeated] = await Promise.all([f.call({ kind: 'open', taskId: task.taskId }), f.call({ kind: 'open', taskId: task.taskId })])
    expect(first.ok).toBe(true)
    expect(repeated).toEqual(first)
    expect(create).toHaveBeenCalledTimes(1)
    expect(prompt).not.toHaveBeenCalled()
    const sessionId = first.value.task.sessionId
    expect(await f.ctx.sessionPersistence.stat(sessionId)).toEqual({ header: { id: sessionId, cwd: f.workspace } })
    expect(f.ctx.sessions.flush).toHaveBeenCalledTimes(1)
    await f.plugin.dispose()
    await f.ctx.plugin(teamDsh)
    expect(await f.call({ kind: 'open', taskId: task.taskId })).toEqual(first)
    expect(create).toHaveBeenCalledTimes(1)
    expect(prompt).not.toHaveBeenCalled()
  })

  it('reuses ready legacy and native bindings but never resends a legacy pending prompt', async () => {
    const f = await fixture({ sessions: true, seed: cwd => {
      const document = legacyDocument(cwd)
      document.tables.tasks['task-6'].mainSession = { sessionId: randomUUID(), cwd, state: 'created', requestId: 'pending', prompt: 'Must not be sent' }
      return document
    } })
    const create = vi.spyOn(f.ctx.sessionController, 'create')
    const prompt = vi.spyOn(f.ctx.sessionController, 'prompt')
    const before = await readFile(f.path, 'utf8')
    for (let index = 0; index < 6; index++) {
      const taskId = `task-${index}`
      expect((await f.call({ kind: 'open', taskId })).value.task.sessionId).toBe(f.original.tables.tasks[taskId].mainSession.sessionId)
    }
    expect(await f.call({ kind: 'open', taskId: 'task-6' })).toEqual({ ok: false, error: { code: 'legacy-pending' } })
    expect(create).not.toHaveBeenCalled()
    expect(prompt).not.toHaveBeenCalled()
    expect(await readFile(f.path, 'utf8')).toBe(before)
  })

  it('refuses a missing ready Session and an identity mismatch without replacing the saved binding', async () => {
    const f = await fixture({ sessions: true, seed: legacyDocument, persistBindings: false })
    const create = vi.spyOn(f.ctx.sessionController, 'create')
    expect(await f.call({ kind: 'open', taskId: 'task-0' })).toEqual({ ok: false, error: { code: 'session-missing' } })
    const stat = vi.spyOn(f.ctx.sessionPersistence, 'stat').mockResolvedValueOnce({ header: { id: 'foreign', cwd: f.workspace } })
    expect(await f.call({ kind: 'open', taskId: 'task-4' })).toEqual({ ok: false, error: { code: 'session-unavailable' } })
    stat.mockRestore()
    expect(create).not.toHaveBeenCalled()
    expect(await f.read()).toEqual(f.original)
  })

  it('drains admitted Session creation before unloading and leaves the saved association readable', async () => {
    const f = await fixture({ sessions: true })
    const task = await f.create()
    const entered = deferred(), held = deferred()
    f.releases.push(held.release)
    const nativeCreate = f.ctx.sessionController.create.bind(f.ctx.sessionController)
    vi.spyOn(f.ctx.sessionController, 'create').mockImplementation(async request => {
      entered.release()
      await held.promise
      return nativeCreate(request)
    })
    const opening = f.call({ kind: 'open', taskId: task.taskId })
    await entered.promise
    let disposed = false
    const disposal = f.plugin.dispose().then(() => { disposed = true })
    expect(disposed).toBe(false)
    held.release()
    const result = await opening
    expect(result.ok).toBe(true)
    await disposal
    expect(f.ctx.get('teamDshTaskApi')).toBeUndefined()
    expect(f.ctx.get('teamDshTaskStore')).toBeUndefined()
    expect(f.ctx.get('teamDshTaskConversations')).toBeUndefined()
    await f.ctx.plugin(teamDsh)
    expect(await f.call({ kind: 'open', taskId: task.taskId })).toEqual(result)
  })

  it('stops using storage after an unconfirmed write and recovers the actual committed task on reload', async () => {
    const f = await fixture()
    const task = await f.create()
    f.writes.intercept = async (_value, commit) => { await commit(); throw new Error('Acknowledgement lost') }
    expect(await f.call({ kind: 'set-done', taskId: task.taskId, done: true })).toEqual({ ok: false, error: { code: 'storage-unavailable' } })
    expect(await f.call({ kind: 'list' })).toEqual({ ok: false, error: { code: 'storage-unavailable' } })
    expect(await f.call({ kind: 'set-done', taskId: task.taskId, done: false })).toEqual({ ok: false, error: { code: 'storage-unavailable' } })
    delete f.writes.intercept
    await f.plugin.dispose()
    await f.ctx.plugin(teamDsh)
    expect((await f.call({ kind: 'list' })).value.tasks).toEqual([{ ...task, done: true }])
  })
})
