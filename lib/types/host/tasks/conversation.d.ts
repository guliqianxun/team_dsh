/** Open the task's saved native Session without sending user or plugin messages. */
import { Service, type Context } from '@deepseek-ai/cordis';
import type { Task, TaskId } from '../shared/task.js';
import { type TaskStore } from './store.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        teamDshTaskConversations: TaskConversations;
    }
}
/** Empty Session creation is serialized per task and drained before dependencies are released. */
export declare class TaskConversations {
    readonly ctx: Context;
    private readonly store;
    readonly [Service.tracker]: {
        associate: string;
        property: string;
    };
    private closing;
    private disposal;
    private readonly pending;
    private readonly controller;
    private readonly sessions;
    private readonly persistence;
    private readonly directory;
    /** @param ctx - Retained DSH Session services. @param store - Task storage retained until setup drains. */
    constructor(ctx: Context, store: TaskStore);
    /** @param taskId - Task to open. @returns Task with the same ready Session, without calling prompt. */
    open(taskId: TaskId): Promise<Task>;
    /** Stop new opens and retain dependencies until setup finishes. @returns Shared close completion. */
    close(): Promise<void>;
    private ensure;
    private checkIdentity;
}
