import { describe, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionBinding, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { HistoryPetController, type HistoryPetServices } from '../src/client/history-controller.js'

const id = (value: string) => brandString<SessionId>(value)
const sourceA = id('source-a'), sourceB = id('source-b'), sourceC = id('source-c'), target = id('review-target')
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture() {
  const abandon = vi.fn()
  const beginSubmission = vi.fn<SessionBinding['session']['beginSubmission']>(() => ({
    requestId: brandString<SessionRequestId>('review-request'), abandon,
  }))
  const prompt = vi.fn<SessionBinding['session']['prompt']>(async () => ({ ok: true, value: { accepted: true } }))
  // These tests exercise only the native Session methods the controller invokes.
  const methods: Pick<SessionBinding['session'], 'beginSubmission' | 'prompt'> = { beginSubmission, prompt }
  const binding = { session: methods as SessionBinding['session'] } as SessionBinding
  const references: Array<SessionReference & { release: ReturnType<typeof vi.fn> }> = []
  const create = vi.fn<HistoryPetServices['sessions']['create']>(async () => target)
  const hasSession = vi.fn<HistoryPetServices['hasSession']>(async () => false)
  const retain = vi.fn<HistoryPetServices['sessions']['retain']>(sessionId => {
    if (typeof sessionId !== 'string') throw new Error('Expected direct Session ID')
    const release = vi.fn()
    const reference = { sessionId, binding, ready: Promise.resolve(binding), release, [Symbol.dispose]: release }
    references.push(reference)
    return reference
  })
  const mentions = vi.fn<HistoryPetServices['mentions']>(async (_target, source) => [{
    sessionId: source, label: source, sameWorkspace: false, createdAt: 0, mention: `@[${source}](native-${source})`,
  }])
  const openSession = vi.fn<HistoryPetServices['openSession']>()
  const services: HistoryPetServices = { sessions: { create, retain }, hasSession, mentions, openSession,
    newSessionId: () => target, prompt: values => `Review the selected history:\n${values.join('\n')}` }
  const controller = new HistoryPetController(services)
  return { controller, create, hasSession, retain, references, mentions, openSession, beginSubmission, prompt, abandon, binding }
}

describe('history pet admission', () => {
  it('accepts only one to three distinct sources without creating on an invalid selection', async () => {
    const f = fixture()
    for (const sources of [[], [sourceA, sourceA], [sourceA, sourceB, sourceC, id('four')]]) {
      expect(await f.controller.start(sources)).toBe(false)
      expect(f.controller.snapshot.getSnapshot().error).toBe('start')
    }
    expect(f.create).not.toHaveBeenCalled()
    expect(await f.controller.start([sourceA, sourceB, sourceC])).toBe(true)
    expect(f.mentions.mock.calls.map(([, source]) => source)).toEqual([sourceA, sourceB, sourceC])
    expect(f.prompt.mock.calls[0]?.[0]).toEqual([{ type: 'text', text: 'Review the selected history:\n@[source-a](native-source-a)\n@[source-b](native-source-b)\n@[source-c](native-source-c)' }])
    expect(f.controller.snapshot.getSnapshot()).toEqual({ busy: false, error: null, sessionId: target, accepted: true })
    expect(f.references[0]?.release).toHaveBeenCalledTimes(1)
    f.controller.dispose()
  })

  it('freezes selection, ignores double clicks and opens the native view before acceptance settles', async () => {
    const f = fixture(), created = deferred<SessionId>(), accepted = deferred<Awaited<ReturnType<SessionBinding['session']['prompt']>>>()
    f.create.mockReturnValueOnce(created.promise)
    f.prompt.mockReturnValueOnce(accepted.promise)
    const sources = [sourceA]
    const first = f.controller.start(sources)
    sources.push(sourceB)
    expect(await f.controller.start([sourceC])).toBe(false)
    created.resolve(target)
    await vi.waitFor(() => expect(f.openSession).toHaveBeenCalledWith(target))
    expect(f.controller.snapshot.getSnapshot()).toMatchObject({ busy: true, accepted: false })
    expect(f.mentions.mock.calls.map(([, source]) => source)).toEqual([sourceA])
    accepted.resolve({ ok: true, value: { accepted: true } })
    expect(await first).toBe(true)
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.prompt).toHaveBeenCalledTimes(1)
    f.controller.dispose()
  })

  it('does not send incomplete sources and reuses the empty Session after selection changes', async () => {
    const f = fixture()
    f.mentions.mockImplementationOnce(async () => [])
    expect(await f.controller.start([sourceA, sourceB])).toBe(false)
    expect(f.prompt).not.toHaveBeenCalled()
    expect(f.beginSubmission).not.toHaveBeenCalled()
    expect(f.references[0]?.release).toHaveBeenCalledTimes(1)
    expect(await f.controller.start([sourceC])).toBe(true)
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.prompt.mock.calls[0]?.[0]).toEqual([{ type: 'text', text: 'Review the selected history:\n@[source-c](native-source-c)' }])
    f.controller.dispose()
  })

  it('retries an unknown prompt with the same Session, frozen text and request identity', async () => {
    const f = fixture()
    f.prompt.mockRejectedValueOnce(new Error('Response lost'))
    expect(await f.controller.start([sourceA])).toBe(false)
    expect(f.controller.snapshot.getSnapshot()).toMatchObject({ error: 'unknown', sessionId: target, accepted: false })
    expect(await f.controller.start([sourceB])).toBe(false)
    expect(await f.controller.retry()).toBe(true)
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.mentions).toHaveBeenCalledTimes(1)
    expect(f.beginSubmission).toHaveBeenCalledTimes(1)
    expect(f.prompt.mock.calls[1]?.[0]).toEqual(f.prompt.mock.calls[0]?.[0])
    expect(f.prompt.mock.calls.map(call => call[3])).toEqual(['review-request', 'review-request'])
    expect(f.retain.mock.calls.map(call => call[0])).toEqual([target, target])
    expect(f.abandon).not.toHaveBeenCalled()
    expect(await f.controller.retry()).toBe(true)
    expect(f.prompt).toHaveBeenCalledTimes(2)
    f.controller.dispose()
  })

  it('recovers an unknown create by its verified original ID and never sends to a replacement ID', async () => {
    const f = fixture()
    f.create.mockRejectedValueOnce(new Error('Create response lost'))
    expect(await f.controller.start([sourceA])).toBe(false)
    f.hasSession.mockResolvedValueOnce(true)
    expect(await f.controller.retry()).toBe(true)
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.hasSession).toHaveBeenCalledWith(target, expect.any(AbortSignal))
    expect(f.retain).toHaveBeenCalledWith(target, expect.anything())
    f.controller.dispose()

    const replaced = fixture()
    replaced.create.mockResolvedValueOnce(id('unexpected-session'))
    expect(await replaced.controller.start([sourceA])).toBe(false)
    expect(replaced.prompt).not.toHaveBeenCalled()
    expect(replaced.retain).not.toHaveBeenCalled()
    expect(replaced.controller.snapshot.getSnapshot().sessionId).toBeNull()
    expect(await replaced.controller.retry()).toBe(true)
    expect(replaced.create.mock.calls.map(call => call[0])).toEqual([{ sessionId: target }, { sessionId: target }])
    replaced.controller.dispose()
  })

  it('does not retry an unknown create until the native list confirms its absence', async () => {
    const f = fixture()
    f.create.mockRejectedValueOnce(new Error('Create response lost'))
    expect(await f.controller.start([sourceA])).toBe(false)
    f.hasSession.mockRejectedValueOnce(new Error('Native list failed'))
    expect(await f.controller.retry()).toBe(false)
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.retain).not.toHaveBeenCalled()
    expect(f.prompt).not.toHaveBeenCalled()
    expect(await f.controller.retry()).toBe(true)
    expect(f.create.mock.calls.map(call => call[0])).toEqual([{ sessionId: target }, { sessionId: target }])
    f.controller.dispose()
  })

  it('ignores late creation or candidates after disposal, releases observations and never sends', async () => {
    const creating = fixture(), created = deferred<SessionId>()
    creating.create.mockReturnValueOnce(created.promise)
    const first = creating.controller.start([sourceA])
    creating.controller.dispose()
    created.resolve(target)
    expect(await first).toBe(false)
    expect(creating.retain).not.toHaveBeenCalled()
    expect(creating.prompt).not.toHaveBeenCalled()

    const reading = fixture(), candidates = deferred<Awaited<ReturnType<HistoryPetServices['mentions']>>>()
    reading.mentions.mockReturnValueOnce(candidates.promise)
    const second = reading.controller.start([sourceA])
    await vi.waitFor(() => expect(reading.mentions).toHaveBeenCalledTimes(1))
    reading.controller.dispose()
    candidates.resolve([{ sessionId: sourceA, label: 'A', mention: 'A', sameWorkspace: false, createdAt: 0 }])
    expect(await second).toBe(false)
    expect(reading.prompt).not.toHaveBeenCalled()
    expect(reading.references[0]?.release).toHaveBeenCalledTimes(1)
    expect(reading.openSession).not.toHaveBeenCalled()
  })

  it('abandons an unsent echo on disposal but does not cancel a prompt already dispatched', async () => {
    const unsent = fixture()
    unsent.beginSubmission.mockImplementationOnce(() => {
      unsent.controller.dispose()
      return { requestId: brandString<SessionRequestId>('unsent'), abandon: unsent.abandon }
    })
    expect(await unsent.controller.start([sourceA])).toBe(false)
    expect(unsent.abandon).toHaveBeenCalledTimes(1)
    expect(unsent.prompt).not.toHaveBeenCalled()

    const sent = fixture(), result = deferred<Awaited<ReturnType<SessionBinding['session']['prompt']>>>()
    sent.prompt.mockReturnValueOnce(result.promise)
    const starting = sent.controller.start([sourceA])
    await vi.waitFor(() => expect(sent.prompt).toHaveBeenCalledTimes(1))
    sent.controller.dispose()
    expect(sent.prompt.mock.calls[0]?.[2]?.aborted).toBe(true)
    result.resolve({ ok: true, value: { accepted: true } })
    expect(await starting).toBe(false)
    expect(sent.abandon).not.toHaveBeenCalled()
    expect(sent.references[0]?.release).toHaveBeenCalledTimes(1)
  })
})
