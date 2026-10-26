/** Owner-only measurements of the exact source IDs submitted by the review picker. */
import { Service, type Context } from '@deepseek-ai/cordis'
import { bindTypertRemote, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { historyRequestSchema, type HistoryResult } from '../shared/history.js'
import { analyzeHistory } from './analyze.js'

declare module '@deepseek-ai/cordis' {
  interface Context { teamDshHistoryApi: HistoryApi }
}

/** Failed or cancelled reads return no partial report; closing drains every observation lease. */
export class HistoryApi {
  static readonly remote: TypertContribution = {
    package: 'team-dsh/history-api', face: 'host', schemas: [], model: { services: [], events: [], objects: [] },
    invocations: [{ id: 'team-dsh/history-api#analyze', service: 'teamDshHistoryApi', namespace: 'teamDshHistoryApi', method: 'analyze',
      invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'src-json' } }],
      cancellation: { parameter: 'signal' }, result: { mode: 'src-json' } }],
  }
  readonly [Service.tracker] = { associate: 'teamDshHistoryApi', property: 'ctx' }
  readonly typertRemote = bindTypertRemote(this, 'teamDshHistoryApi')
  private readonly active = new Set<Promise<HistoryResult>>()
  private readonly shutdown = new AbortController()
  private disposal: Promise<void> | undefined

  /** @param ctx Scope retaining the native sessionQuery service throughout reads. */
  constructor(readonly ctx: Context) {}

  /** @param request Explicit source selection. @param signal Caller cancellation. @returns Complete measurements or a stable failure code. */
  @Remote
  analyze(request: unknown, signal: AbortSignal): Promise<HistoryResult> {
    if (this.ctx.invocation?.peer.principal.kind !== 'owner') return Promise.resolve({ ok: false, error: 'forbidden' })
    if (this.shutdown.signal.aborted) return Promise.resolve({ ok: false, error: 'closed' })
    if (signal.aborted) return Promise.resolve({ ok: false, error: 'cancelled' })
    const parsed = historyRequestSchema.safeParse(request)
    if (!parsed.success) return Promise.resolve({ ok: false, error: 'invalid-request' })
    const result = this.read(parsed.data.sourceIds, AbortSignal.any([signal, this.shutdown.signal]))
    this.active.add(result)
    void result.then(() => this.active.delete(result), () => this.active.delete(result))
    return result
  }

  /** Cancel reads and wait for their leases before releasing the query dependency. */
  close(): Promise<void> {
    this.shutdown.abort()
    return this.disposal ??= Promise.allSettled([...this.active]).then(() => {})
  }

  private async read(sourceIds: ReturnType<typeof historyRequestSchema.parse>['sourceIds'], signal: AbortSignal): Promise<HistoryResult> {
    try {
      const sources = []
      for (const id of sourceIds) {
        signal.throwIfAborted()
        const observation = await this.ctx.sessionQuery.observeSession(id, { signal, projectionMode: 'none' })
        const live = observation.source === 'live'
        try {
          signal.throwIfAborted()
          if (observation.header.id !== id) throw new Error('Selected Session identity changed')
          if (live) sources.push(analyzeHistory(observation))
        } finally { observation[Symbol.dispose]() }
        if (!live) {
          // Prepared observations synthesize interrupted-tail results. Read the stored
          // prefix so these do not become measured failures or invented durations.
          signal.throwIfAborted()
          const handle = await this.ctx.sessionPersistence.open(id, 'read', { signal })
          try {
            signal.throwIfAborted()
            if (handle.header.id !== id) throw new Error('Stored Session identity changed')
            const { events } = await handle.read(0, undefined, { signal })
            signal.throwIfAborted()
            sources.push(analyzeHistory({ header: handle.header, inheritedEventCount: handle.inheritedEventCount,
              cursor: events.at(-1)?.seq ?? -1, events }))
          } finally { await handle.close() }
        }
      }
      signal.throwIfAborted()
      return { ok: true, sources }
    } catch (error) {
      if (signal.aborted) return { ok: false, error: 'cancelled' }
      this.ctx.logger.error('Selected history could not be measured.', error)
      return { ok: false, error: 'unavailable' }
    }
  }
}
