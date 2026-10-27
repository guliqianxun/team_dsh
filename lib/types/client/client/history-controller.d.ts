/** One explicit history review uses a native Session and a fixed prompt identity. */
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import { type ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { SessionReferenceMentionCandidate } from '@deepseek-ai/dsh-session-reference/types';
import type { HistoryAnalysis } from '../shared/history.js';
/** Acceptance means inbox admission, never completion of the review. */
export interface HistoryPetSnapshot {
    busy: boolean;
    error: 'start' | 'analysis' | 'unknown' | null;
    sessionId: SessionId | null;
    accepted: boolean;
}
/** Native references and measured metadata; no source transcript is copied into the client. */
export interface HistoryPetServices {
    sessions: Pick<ISessions, 'create' | 'retain'>;
    hasSession(id: SessionId, signal: AbortSignal): Promise<boolean>;
    mentions(targetId: SessionId, sourceId: SessionId, signal: AbortSignal): Promise<SessionReferenceMentionCandidate[]>;
    analyze(sourceIds: readonly SessionId[], signal: AbortSignal): Promise<HistoryAnalysis[]>;
    openSession(id: SessionId): void;
    newSessionId(): SessionId;
    prompt(mentions: string[], analysis: HistoryAnalysis[], includeRecommendations: boolean): string;
}
/** Pet actions and their observable admission state. */
export interface HistoryPetFace {
    hooks: {
        historyPet: ObservableSnapshot<HistoryPetSnapshot>;
    };
    start(sourceIds: readonly SessionId[], includeRecommendations?: boolean): Promise<boolean>;
    retry(): Promise<boolean>;
    openResult(): void;
    openSource(id: SessionId): void;
    clearError(): void;
}
/** A same-page retry reuses the Session, source text and original RPC identity. */
export declare class HistoryPetController {
    private readonly services;
    readonly snapshot: import("@deepseek-ai/dsh-client-store").SnapshotStore<HistoryPetSnapshot>;
    private attempt;
    private operation;
    private reference;
    private closed;
    /** @param services Native Session ownership, canonical mentions and navigation. */
    constructor(services: HistoryPetServices);
    /** @returns Observable state and explicit user actions. */
    face(): HistoryPetFace;
    /** @param sourceIds One to three distinct selected source Sessions. @param includeRecommendations Whether this review may use native read-only market tools after identifying task needs. */
    start(sourceIds: readonly SessionId[], includeRecommendations?: boolean): Promise<boolean>;
    /** Retry the existing admission without changing its identity or source selection. */
    retry(): Promise<boolean>;
    /** Show the actual native conversation even when its admission response was lost. */
    openResult(): void;
    /** Dismiss copy without discarding an unresolved request. */
    clearError(): void;
    /** Release local observation; never cancel an already admitted Agent turn. */
    dispose(): void;
    private run;
    private abandonUnsent;
}
