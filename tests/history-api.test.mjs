/** Real native observation, JSONL and Gateway, confined to a synthetic temporary corpus. */
import { Context } from '@deepseek-ai/cordis'
import RemoteAccess from '@deepseek-ai/dsh-api-remote-access'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import Typert from '@deepseek-ai/dsh-typert-registry'
import SessionStore, { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionQuery from '@deepseek-ai/dsh-session-query'
import { createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { HistoryApi } from '../src/history/api.js'
import { historyResultSchema } from '../src/shared/history.js'

class ReadQuery extends SessionQuery {
  searchSessions() { throw new Error('Measurement must not search the corpus') }
  searchEvents() { throw new Error('Measurement must not search other events') }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'team-dsh-history-'))
  const ctx = new Context()
  const releaseHeld = []
  onTestFinished(async () => {
    for (const release of releaseHeld) release()
    try { await ctx.fiber.dispose() } finally { await rm(root, { recursive: true, force: true }) }
  })
  await ctx.plugin(SessionStore)
  await ctx.plugin(Jsonl, { root, compression: 'none' })
  await ctx.plugin(ReadQuery)
  await ctx.plugin(Typert)
  await ctx.plugin(RemoteAccess)
  await ctx.plugin(Gateway)
  const plugin = await ctx.plugin({ inject: ['sessionQuery', 'sessionPersistence', 'typert'], async apply(scope) {
    await scope.effect(function* () {
      const api = new HistoryApi(scope)
      yield scope.typert.register(HistoryApi.remote)
      yield scope.provide('teamDshHistoryApi', api)
      yield () => api.close()
    })
  } })
  const peer = { id: 'history-owner', ctx, principal: { kind: 'owner' }, signal: new AbortController().signal,
    interactions: 'none', dispose: async () => {} }
  const call = async (request, selectedPeer = peer, signal = peer.signal) => historyResultSchema.parse(await ctx.typertGateway.invoke({
    namespace: 'teamDshHistoryApi', method: 'analyze', args: { request }, peer: selectedPeer, signal,
  }))
  return { ctx, call, peer, plugin, releaseHeld }
}

function openToolLog() {
  return [
    { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
    { type: 'step/start', seq: 1, time: 2, data: { turn: 1, step: 1 } },
    { type: 'assistant/message', seq: 2, time: 3, surfaceOp: 'append', data: { turn: 1, step: 1, stream: [],
      message: createAssistantMessage({ source: { provider: 'fixture', model: 'fixture' },
        content: [{ type: 'tool-call', id: 'pending', name: 'shell', arguments: '{}' }] }) } },
    { type: 'tool/call', seq: 3, time: 4, data: { turn: 1, step: 1, callId: 'pending', name: 'shell', arguments: '{}' } },
  ]
}

describe('history Gateway', () => {
  it('reads only selected IDs and reports the original persisted crash tail without the native synthetic results', async () => {
    const f = await fixture()
    const header = { id: 'cold-selected', version: SESSION_FORMAT_VERSION, createdAt: 0, isSeeded: false, cwd: '/synthetic/selected' }
    const writer = await f.ctx.sessionPersistence.create(header)
    await writer.append(openToolLog())
    await writer.close()
    const prepared = await f.ctx.sessionQuery.observeSession(header.id, { projectionMode: 'none' })
    expect(prepared.source).toBe('prepared')
    expect(prepared.events.some(event => event.data.error?.code === 'TOOL_OUTCOME_UNKNOWN')).toBe(true)
    prepared[Symbol.dispose]()
    const observe = vi.spyOn(f.ctx.sessionQuery, 'observeSession')
    const list = vi.spyOn(f.ctx.sessionPersistence, 'list')
    const reply = await f.call({ sourceIds: [header.id] })
    expect(reply.ok).toBe(true)
    expect(reply.sources[0]).toMatchObject({ capturedThroughSeq: 3, recoveryResults: 0,
      tools: [{ name: 'shell', calls: 1, completed: 0, explicitErrors: 0, unfinished: 1, measuredDurations: 0, elapsedMs: null }],
      calls: [{ callSeq: 3, resultSeq: null, recoverySeq: null, explicitError: null, elapsedMs: null }] })
    expect(observe.mock.calls.map(([id]) => id)).toEqual([header.id])
    expect(list).not.toHaveBeenCalled()
    const reader = await f.ctx.sessionPersistence.open(header.id, 'read')
    try { expect((await reader.read()).events).toHaveLength(4) } finally { await reader.close() }
  })

  it('holds the live cutoff and disposes its lease even when another event arrives before analysis', async () => {
    const f = await fixture()
    const session = f.ctx.sessions.create('live-selected', { seed: openToolLog(), meta: { cwd: '/synthetic/live' } })
    const native = f.ctx.sessionQuery.observeSession.bind(f.ctx.sessionQuery)
    const release = vi.fn()
    vi.spyOn(f.ctx.sessionQuery, 'observeSession').mockImplementationOnce(async (id, options) => {
      const observation = await native(id, options)
      session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({
        callId: 'pending', isError: false, content: [] }) }, { surfaceOp: 'append' })
      return { ...observation, [Symbol.dispose]: () => { observation[Symbol.dispose](); release() } }
    })
    const reply = await f.call({ sourceIds: [session.id] })
    // SessionStore marks the end of an imported seed at seq 4.
    expect(reply.sources[0].capturedThroughSeq).toBe(4)
    expect(reply.sources[0].calls[0].resultSeq).toBeNull()
    expect(release).toHaveBeenCalledTimes(1)
    const newer = await f.call({ sourceIds: [session.id] })
    expect(newer.sources[0].calls[0].resultSeq).toBe(5)
  })

  it('rejects invalid selections and non-owners before reading any source, including a guest with the RPC action grant', async () => {
    const f = await fixture()
    f.ctx.effect(() => f.ctx.remoteAccess.registerPolicy('historyGuest', { bindings: () => [{ resource: { kind: 'global' },
      role: { name: 'fixture', resource: 'global', actions: ['teamDshHistoryApi/analyze'] } }] }))
    const observe = vi.spyOn(f.ctx.sessionQuery, 'observeSession')
    for (const sourceIds of [[], ['a', 'a'], ['a', 'b', 'c', 'd']]) {
      expect(await f.call({ sourceIds })).toEqual({ ok: false, error: 'invalid-request' })
    }
    expect(await f.call({ sourceIds: ['a'] }, { ...f.peer, principal: { kind: 'historyGuest' } })).toEqual({ ok: false, error: 'forbidden' })
    expect(observe).not.toHaveBeenCalled()
  })

  it('discards a partial report when a later selected source fails', async () => {
    const f = await fixture()
    f.ctx.sessions.create('available', { meta: { cwd: '/synthetic/available' } })
    const observe = vi.spyOn(f.ctx.sessionQuery, 'observeSession')
    expect(await f.call({ sourceIds: ['available', 'missing'] })).toEqual({ ok: false, error: 'unavailable' })
    expect(observe.mock.calls.map(([id]) => id)).toEqual(['available', 'missing'])
  })

  it('waits for cancellation to release a late lease before removing the API', async () => {
    const f = await fixture()
    f.ctx.sessions.create('held', { meta: { cwd: '/synthetic/held' } })
    const native = f.ctx.sessionQuery.observeSession.bind(f.ctx.sessionQuery)
    let unblock
    const held = new Promise(resolve => { unblock = resolve })
    f.releaseHeld.push(unblock)
    const release = vi.fn()
    let capturedSignal
    const observe = vi.spyOn(f.ctx.sessionQuery, 'observeSession').mockImplementationOnce(async (id, options) => {
      capturedSignal = options.signal
      const observation = await native(id, options)
      await held
      return { ...observation, [Symbol.dispose]: () => { observation[Symbol.dispose](); release() } }
    })
    const pending = f.call({ sourceIds: ['held'] })
    await vi.waitFor(() => expect(observe).toHaveBeenCalledTimes(1))
    let closed = false
    const closing = f.plugin.dispose().then(() => { closed = true })
    await vi.waitFor(() => expect(capturedSignal.aborted).toBe(true))
    expect(closed).toBe(false)
    unblock()
    expect(await pending).toEqual({ ok: false, error: 'cancelled' })
    await closing
    expect(release).toHaveBeenCalledTimes(1)
    expect(f.ctx.get('teamDshHistoryApi')).toBeUndefined()
  })
})
