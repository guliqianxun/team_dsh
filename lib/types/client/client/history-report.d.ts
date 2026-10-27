/** Readable measurements preserved in the native review message, with source mentions and event seqs. */
import { type HistoryAnalysis } from '../shared/history.js';
import type { TaskLocaleKey } from './locales.js';
type Translate = (key: TaskLocaleKey) => string;
/** @param sources Captured measurements in selected order. @param mentions Canonical native source links. @param t Active locale. @returns Source-separated tables; no cross-source sum that could double-count fork history. */
export declare function formatHistoryAnalysis(sources: readonly HistoryAnalysis[], mentions: readonly string[], t: Translate): string;
/** @param sources Selected measurements. @param mentions Canonical source references. @param t Active locale. @param includeRecommendations Allows native market lookup after evidence-based need identification. @returns Instructions and measurements persisted by native Session submission; native tool events record later searches. */
export declare function formatHistoryPrompt(sources: readonly HistoryAnalysis[], mentions: readonly string[], t: Translate, includeRecommendations?: boolean): string;
export {};
