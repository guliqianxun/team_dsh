/** Task actions and actionable failures in the two supported locales. */
import type { TaskIssue } from './controller.js';
type AnalysisKey = 'title' | 'scope' | 'cutoff' | 'inherited' | 'unknown' | 'unfinished' | 'error' | 'completed' | 'recovery' | 'toolsHeader' | 'callsHeader' | 'totalsHeader' | 'usageHeader' | 'noTools' | 'noUsage' | 'unmatched' | 'omittedCalls' | 'omittedUsage' | 'highlights' | 'highlightScope' | 'details' | `highlight.${keyof import('../shared/history.js').HistoryAnalysis['highlights']}` | import('../shared/history.js').UsageField;
type PetKey = `analysis.${AnalysisKey}` | 'title' | 'move' | 'close' | 'previous' | 'viewConversation' | 'start' | 'starting' | 'limit' | 'search' | 'empty' | 'prompt' | 'prompt.evidence' | 'prompt.actions' | 'error.start' | 'error.analysis' | 'error.unknown' | 'error.list' | 'appearance' | 'whale' | 'cat' | 'custom' | 'upload' | `appearanceError.${import('./history-appearance.js').AppearanceError}`;
export type TaskLocaleKey = 'title' | 'newTask' | 'add' | 'back' | 'done' | 'markDone' | 'retry' | 'loading' | `error.${TaskIssue}` | `pet.${PetKey}`;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        teamDsh: TaskLocaleKey;
    }
}
export declare const en: Record<TaskLocaleKey, string>;
export declare const zh: Record<TaskLocaleKey, string>;
export {};
