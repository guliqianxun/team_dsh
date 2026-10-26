/** One task list and one owned native conversation reference per plugin instance. */
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import { type ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { Task, TaskApiRequest, TaskApiResult, TaskErrorCode, TaskId, TaskStorageId } from '../shared/task.js';
type Write = Extract<TaskApiRequest, {
    kind: 'create' | 'set-done';
}>;
export type TaskIssue = TaskErrorCode | 'connection';
/** The page retains confirmed rows when a request fails. */
export interface TaskSnapshot {
    tasks: Task[] | null;
    storageId: TaskStorageId | null;
    draft: string;
    connected: boolean;
    loading: boolean;
    saving: boolean;
    pending: Write['kind'] | null;
    error: TaskIssue | null;
    selectedId: TaskId | null;
    reference: SessionReference | null;
    opening: boolean;
    sessionError: TaskIssue | null;
}
/** Only the apply closure talks to Host and acquires Session references. */
export interface TaskServices {
    connection: Pick<ConnectionHandle, 'generation'>;
    request(request: TaskApiRequest, signal: AbortSignal): Promise<TaskApiResult>;
    retain(sessionId: SessionId, signal: AbortSignal): SessionReference;
    newRequestId(): string;
}
/** Framework-bound reactive data and explicit page actions. */
export interface TaskFace {
    hooks: {
        tasks: ObservableSnapshot<TaskSnapshot>;
    };
    setDraft(text: string): void;
    createTask(): Promise<void>;
    setDone(taskId: TaskId, done: boolean): Promise<void>;
    refreshTasks(): Promise<void>;
    retryWrite(): Promise<void>;
    openTask(taskId: TaskId): Promise<void>;
    back(): void;
}
/** Own request cancellation, task navigation and the currently displayed Session. */
export declare class TaskController {
    private readonly services;
    readonly snapshot: import("@deepseek-ai/dsh-client-store").SnapshotStore<TaskSnapshot>;
    private active;
    private closed;
    private epoch;
    private navigation;
    private reads;
    private pending;
    private reference;
    private opening;
    private readonly unsubscribe;
    /** @param services Host transport and native Session ownership. */
    constructor(services: TaskServices);
    /** @returns Data and callbacks supplied to the panel registration. */
    face(): TaskFace;
    /** Release hidden conversations; returning reads current tasks before reopening the selection.
     * @param active Whether the task panel is the selected main panel.
     */
    setActive(active: boolean): void;
    /** Refresh confirmed task rows without creating a task or submitting chat input. */
    refresh(): Promise<void>;
    /** Create from one line; a failed attempt retains the same request identity. */
    create(): Promise<void>;
    /** @param taskId Existing task. @param done User-selected completion value. */
    setDone(taskId: TaskId, done: boolean): Promise<void>;
    /** Retry the original creation or absolute completion value, never a replacement request. */
    retry(): Promise<void>;
    private write;
    /** Open the exact task's native conversation; no input is filled or sent.
     * @param taskId Task selected by the user.
     */
    open(taskId: TaskId): Promise<void>;
    /** Return to the list and release its conversation reference. */
    back(): void;
    /** Stop new work and release pending or displayed conversation references. */
    dispose(): void;
    private usable;
    private current;
    private adopt;
    private release;
}
export {};
