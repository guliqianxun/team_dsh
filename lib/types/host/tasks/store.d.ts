import type { Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { z } from 'zod';
import { type Task, type TaskId, type TaskStorageId, type TaskErrorCode } from '../shared/task.js';
declare const bindingSchema: z.ZodObject<{
    sessionId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
    cwd: z.ZodString;
    state: z.ZodEnum<{
        reserved: "reserved";
        created: "created";
        ready: "ready";
    }>;
    mode: z.ZodOptional<z.ZodLiteral<"native">>;
}, z.core.$loose>;
declare const storedTaskSchema: z.ZodObject<{
    taskId: z.ZodPipe<z.ZodString, z.ZodTransform<TaskId, string>>;
    title: z.ZodString;
    status: z.ZodEnum<{
        done: "done";
        todo: "todo";
        in_progress: "in_progress";
    }>;
    creationRequestId: z.ZodString;
    creationText: z.ZodOptional<z.ZodString>;
    goal: z.ZodOptional<z.ZodString>;
    statusRevision: z.ZodOptional<z.ZodNumber>;
    mainSession: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        sessionId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
        cwd: z.ZodString;
        state: z.ZodEnum<{
            reserved: "reserved";
            created: "created";
            ready: "ready";
        }>;
        mode: z.ZodOptional<z.ZodLiteral<"native">>;
    }, z.core.$loose>>>;
}, z.core.$loose>;
/** Fields needed for task edits; unexposed earlier properties remain stored verbatim. */
export type StoredTask = z.infer<typeof storedTaskSchema>;
/** Existing ready bindings are reusable; pending legacy submissions are never sent. */
export type TaskBinding = z.infer<typeof bindingSchema>;
/** Keep both historical tables declared because single-file storage republishes all declared tables. */
export declare const taskDomainSpec: {
    name: string;
    version: number;
    layout: "single";
    global: {
        schema: z.ZodObject<{
            storageId: z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<TaskStorageId, string>>>;
        }, z.core.$loose>;
        initial: {
            storageId: null;
        };
    };
    tables: {
        tasks: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<TaskId, {
            [x: string]: unknown;
            taskId: TaskId;
            title: string;
            status: "done" | "todo" | "in_progress";
            creationRequestId: string;
            creationText?: string | undefined;
            goal?: string | undefined;
            statusRevision?: number | undefined;
            mainSession?: {
                [x: string]: unknown;
                sessionId: SessionId;
                cwd: string;
                state: "reserved" | "created" | "ready";
                mode?: "native" | undefined;
            } | null | undefined;
        }>;
        executions: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, z.core.util.JSONType>;
        reviews: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, z.core.util.JSONType>;
    };
};
/** A failed write blocks further use until storage is reopened and reread. */
export declare class TaskStoreError extends Error {
    readonly code: TaskErrorCode;
    /** @param code - Public failure category. @param cause - Host-only diagnostic cause. */
    constructor(code: TaskErrorCode, cause?: unknown);
}
/** One store serializes mutations while DSH owns the associated Sessions. */
export declare class TaskStore {
    private readonly domain;
    readonly storageId: TaskStorageId;
    private readonly requests;
    private chain;
    private closing;
    private failure;
    private disposal;
    private constructor();
    /** @param ctx - Host with storageDomain. @returns Open store; its owner must close it after consumers drain. */
    static open(ctx: Context): Promise<TaskStore>;
    /** @returns Saved tasks without execution state or inferred completion. */
    list(): Task[];
    /** @param taskId - Saved task identity. @returns Detached retained fields for Session binding. */
    get(taskId: TaskId): StoredTask;
    /** @param requestId - Stable creation intent. @param text - Normalized task name. @returns Original or newly saved task. */
    create(requestId: string, text: string): Promise<Task>;
    /** @param taskId - Task selected by the user. @param done - Explicit completion choice. @returns Acknowledged task state. */
    setDone(taskId: TaskId, done: boolean): Promise<Task>;
    /** @param taskId - Task to open. @param cwd - Directory for an empty new Session. @returns Fixed saved binding, before Session creation. */
    reserve(taskId: TaskId, cwd: string): Promise<TaskBinding>;
    /** @param taskId - Owner of the reserved Session. @param sessionId - Identity whose persistence was confirmed. @returns Task with its ready binding. */
    ready(taskId: TaskId, sessionId: SessionId): Promise<Task>;
    /** Stop admission, drain writes, then release the domain. @returns Shared close completion. */
    close(): Promise<void>;
    /** @param task - Saved record. @returns Only fields used by the task panel. */
    present(task: StoredTask): Task;
    private require;
    private assertReadable;
    private enqueue;
    private persist;
}
export {};
