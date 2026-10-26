import type { SessionObservation } from '@deepseek-ai/dsh-session-query';
import { type HistoryAnalysis } from '../shared/history.js';
/**
 * Read log facts without inspecting tool arguments, result content, or other Sessions.
 * Durations are result time minus call time, not exclusive execution time. Unknown
 * usage fields remain absent; reasoning tokens are never added to output tokens.
 * @param observation Caller-owned, replay-validated native observation.
 * @returns Detached measurements with event sequence numbers for native verification.
 */
export declare function analyzeHistory(observation: Pick<SessionObservation, 'header' | 'events' | 'cursor' | 'inheritedEventCount'>): HistoryAnalysis;
