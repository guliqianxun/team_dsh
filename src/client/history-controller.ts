/** One explicit history review uses a native Session and a fixed prompt identity. */
import type { ISessions, SessionReference, SubmissionHandle } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionReferenceMentionCandidate } from '@deepseek-ai/dsh-session-reference/types'
import type { HistoryAnalysis } from '../shared/history.js'

/** Acceptance means inbox admission, never completion of the review. */
export interface HistoryPetSnapshot {
  busy: boolean
  error: 'start' | 'analysis' | 'unknown' | null
  sessionId: SessionId | null
  accepted: boolean
}

/** Native references and measured metadata; no source transcript is copied into the client. */
export interface HistoryPetServices {
  sessions: Pick<ISessions, 'create' | 'retain'>
  hasSession(id: SessionId, signal: AbortSignal): Promise<boolean>
  mentions(targetId: SessionId, sourceId: SessionId, signal: AbortSignal): Promise<SessionReferenceMentionCandidate[]>
  analyze(sourceIds: readonly SessionId[], signal: AbortSignal): Promise<HistoryAnalysis[]>
  openSession(id: SessionId): void
  newSessionId(): SessionId
  prompt(mentions: string[], analysis: HistoryAnalysis[]): string
}

/** Pet actions and their observable admission state. */
export interface HistoryPetFace {
  hooks: { historyPet: ObservableSnapshot<HistoryPetSnapshot> }
  start(sourceIds: readonly SessionId[]): Promise<boolean>
  retry(): Promise<boolean>
  openResult(): void
  openSource(id: SessionId): void
  clearError(): void
}

interface ReviewAttempt {
  sources: readonly SessionId[]
  requestedId: SessionId
  createAttempted: boolean
  sessionId: SessionId | null
  text: string | null
  submission: SubmissionHandle | null
  sent: boolean
}

/** A same-page retry reuses the Session, source text and original RPC identity. */
export class HistoryPetController {
  readonly snapshot = createSnapshotStore<HistoryPetSnapshot>({ busy: false, error: null, sessionId: null, accepted: false })
  private attempt: ReviewAttempt | null = null
  private operation: AbortController | null = null
  private reference: SessionReference | null = null
  private closed = false

  /** @param services Native Session ownership, canonical mentions and navigation. */
  constructor(private readonly services: HistoryPetServices) {}

  /** @returns Observable state and explicit user actions. */
  face(): HistoryPetFace {
    return { hooks: { historyPet: this.snapshot }, start: ids => this.start(ids), retry: () => this.retry(),
      openResult: () => this.openResult(), openSource: id => { if (!this.closed) this.services.openSession(id) },
      clearError: () => this.clearError() }
  }

  /** @param sourceIds One to three distinct selected source Sessions. */
  async start(sourceIds: readonly SessionId[]): Promise<boolean> {
    if (this.closed || this.operation !== null) return false
    if (this.attempt?.sent && !this.snapshot.getSnapshot().accepted) {
      this.snapshot.update(state => { state.error = 'unknown' }); return false
    }
    if (sourceIds.length < 1 || sourceIds.length > 3 || new Set(sourceIds).size !== sourceIds.length) {
      this.snapshot.update(state => { state.error = 'start' }); return false
    }
    if (this.attempt !== null && !this.snapshot.getSnapshot().accepted) {
      this.attempt.sources = [...sourceIds]
      this.attempt.text = null
    } else {
      this.attempt = { sources: [...sourceIds], requestedId: this.services.newSessionId(), createAttempted: false, sessionId: null,
        text: null, submission: null, sent: false }
    }
    return this.run(this.attempt)
  }

  /** Retry the existing admission without changing its identity or source selection. */
  async retry(): Promise<boolean> {
    if (this.closed || this.operation !== null || this.attempt === null) return false
    if (this.snapshot.getSnapshot().accepted) { this.openResult(); return true }
    return this.run(this.attempt)
  }

  /** Show the actual native conversation even when its admission response was lost. */
  openResult(): void {
    const id = this.snapshot.getSnapshot().sessionId
    if (!this.closed && id !== null) this.services.openSession(id)
  }

  /** Dismiss copy without discarding an unresolved request. */
  clearError(): void {
    if (!this.closed) this.snapshot.update(state => { state.error = null })
  }

  /** Release local observation; never cancel an already admitted Agent turn. */
  dispose(): void {
    if (this.closed) return
    this.closed = true
    this.operation?.abort()
    this.abandonUnsent()
    this.reference?.release()
    this.reference = null
  }

  private async run(attempt: ReviewAttempt): Promise<boolean> {
    const operation = new AbortController()
    this.operation = operation
    const { signal } = operation
    let readingAnalysis = false
    this.snapshot.update(state => { state.busy = true; state.error = null; state.accepted = false; state.sessionId = attempt.sessionId })
    try {
      signal.throwIfAborted()
      if (attempt.sessionId === null) {
        if (attempt.createAttempted) {
          const exists = await this.services.hasSession(attempt.requestedId, signal)
          signal.throwIfAborted()
          if (exists) attempt.sessionId = attempt.requestedId
        }
        if (attempt.sessionId === null) {
          attempt.createAttempted = true
          const id = await this.services.sessions.create({ sessionId: attempt.requestedId })
          signal.throwIfAborted()
          if (id !== attempt.requestedId) throw new Error('Created Session differs from the requested identity')
          attempt.sessionId = id
        }
        this.snapshot.update(state => { state.sessionId = attempt.sessionId })
      }
      signal.throwIfAborted()
      const reference = this.services.sessions.retain(attempt.sessionId, { source: 'teamDshPet', signal })
      this.reference = reference
      const { session } = await reference.ready
      signal.throwIfAborted()
      if (attempt.text === null) {
        const mentions = await Promise.all(attempt.sources.map(async sourceId => {
          const candidates = await this.services.mentions(attempt.sessionId!, sourceId, signal)
          signal.throwIfAborted()
          const candidate = candidates.find(value => value.sessionId === sourceId)
          if (candidate === undefined) throw new Error('Selected source is unavailable')
          return candidate.mention
        }))
        signal.throwIfAborted()
        readingAnalysis = true
        const analysis = await this.services.analyze(attempt.sources, signal)
        signal.throwIfAborted()
        if (analysis.length !== attempt.sources.length || analysis.some((source, index) => source.sessionId !== attempt.sources[index])) {
          throw new Error('Measurements do not match selected sources')
        }
        attempt.text = this.services.prompt(mentions, analysis)
        readingAnalysis = false
      }
      attempt.submission ??= session.beginSubmission({ mode: 'queue', text: attempt.text, attachments: [] })
      signal.throwIfAborted()
      attempt.sent = true
      const pending = session.prompt([{ type: 'text', text: attempt.text }], 'queue', signal, attempt.submission.requestId)
      let shown = true
      try { this.services.openSession(attempt.sessionId) } catch { shown = false }
      const result = await pending
      signal.throwIfAborted()
      this.snapshot.update(state => { state.accepted = result.ok && result.value.accepted; state.error = state.accepted ? shown ? null : 'start' : 'unknown' })
      return result.ok && result.value.accepted
    } catch (_error) {
      if (!this.closed) this.snapshot.update(state => { state.error = attempt.sent ? 'unknown' : readingAnalysis ? 'analysis' : 'start' })
      return false
    } finally {
      this.abandonUnsent()
      this.reference?.release()
      this.reference = null
      this.operation = null
      if (!this.closed) this.snapshot.update(state => { state.busy = false })
    }
  }

  private abandonUnsent(): void {
    if (this.attempt?.submission !== null && this.attempt?.submission !== undefined && !this.attempt.sent) {
      this.attempt.submission.abandon()
      this.attempt.submission = null
    }
  }
}
