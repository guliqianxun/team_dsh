/** Task actions and actionable failures in the two supported locales. */
import type { TaskIssue } from './controller.js';
type PetKey = 'title' | 'move' | 'close' | 'previous' | 'viewConversation' | 'start' | 'starting' | 'limit' | 'search' | 'empty' | 'prompt' | 'error.start' | 'error.unknown' | 'error.list' | 'appearance' | 'whale' | 'cat' | 'custom' | 'upload' | `appearanceError.${import('./history-appearance.js').AppearanceError}`;
export type TaskLocaleKey = 'title' | 'newTask' | 'add' | 'back' | 'done' | 'markDone' | 'retry' | 'loading' | `error.${TaskIssue}` | `pet.${PetKey}`;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        teamDsh: TaskLocaleKey;
    }
}
export declare const en: Record<TaskLocaleKey, string>;
export declare const zh: Record<TaskLocaleKey, string>;
export {};
