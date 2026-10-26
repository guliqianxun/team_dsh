/** The task list owns names and completion; DSH owns the associated conversations. */
import { type Branded } from '@deepseek-ai/dsh-brand';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { z } from 'zod';
export type TaskId = Branded<'TeamDshTaskId'>;
export type TaskStorageId = Branded<'TeamDshTaskStorageId'>;
export declare const taskIdSchema: z.ZodPipe<z.ZodString, z.ZodTransform<TaskId, string>>;
export declare const taskStorageIdSchema: z.ZodPipe<z.ZodString, z.ZodTransform<TaskStorageId, string>>;
export declare const sessionIdSchema: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
/** Only these fields are exposed by the minimal task panel. */
export declare const taskSchema: z.ZodObject<{
    taskId: z.ZodPipe<z.ZodString, z.ZodTransform<TaskId, string>>;
    title: z.ZodString;
    done: z.ZodBoolean;
    sessionId: z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>>;
}, z.core.$strict>;
export type Task = z.infer<typeof taskSchema>;
/** A creation retry keeps its requestId and text; opening never submits a message. */
export declare const taskApiRequestSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"list">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"create">;
    storageId: z.ZodPipe<z.ZodString, z.ZodTransform<TaskStorageId, string>>;
    requestId: z.ZodString;
    text: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"set-done">;
    storageId: z.ZodPipe<z.ZodString, z.ZodTransform<TaskStorageId, string>>;
    taskId: z.ZodPipe<z.ZodString, z.ZodTransform<TaskId, string>>;
    done: z.ZodBoolean;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"open">;
    storageId: z.ZodPipe<z.ZodString, z.ZodTransform<TaskStorageId, string>>;
    taskId: z.ZodPipe<z.ZodString, z.ZodTransform<TaskId, string>>;
}, z.core.$strict>], "kind">;
export type TaskApiRequest = z.infer<typeof taskApiRequestSchema>;
export declare const taskErrorCodeSchema: z.ZodEnum<{
    closed: "closed";
    cancelled: "cancelled";
    forbidden: "forbidden";
    "invalid-request": "invalid-request";
    "wrong-storage": "wrong-storage";
    "task-not-found": "task-not-found";
    "request-conflict": "request-conflict";
    "storage-unavailable": "storage-unavailable";
    "session-unavailable": "session-unavailable";
    "session-missing": "session-missing";
    "legacy-pending": "legacy-pending";
}>;
export type TaskErrorCode = z.infer<typeof taskErrorCodeSchema>;
/** Failures carry localized codes; neither failures nor reads imply a task is done. */
export declare const taskApiResultSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    ok: z.ZodLiteral<true>;
    storageId: z.ZodPipe<z.ZodString, z.ZodTransform<TaskStorageId, string>>;
    value: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"list">;
        tasks: z.ZodArray<z.ZodObject<{
            taskId: z.ZodPipe<z.ZodString, z.ZodTransform<TaskId, string>>;
            title: z.ZodString;
            done: z.ZodBoolean;
            sessionId: z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>>;
        }, z.core.$strict>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"task">;
        task: z.ZodObject<{
            taskId: z.ZodPipe<z.ZodString, z.ZodTransform<TaskId, string>>;
            title: z.ZodString;
            done: z.ZodBoolean;
            sessionId: z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>>;
        }, z.core.$strict>;
    }, z.core.$strict>], "kind">;
}, z.core.$strict>, z.ZodObject<{
    ok: z.ZodLiteral<false>;
    error: z.ZodObject<{
        code: z.ZodEnum<{
            closed: "closed";
            cancelled: "cancelled";
            forbidden: "forbidden";
            "invalid-request": "invalid-request";
            "wrong-storage": "wrong-storage";
            "task-not-found": "task-not-found";
            "request-conflict": "request-conflict";
            "storage-unavailable": "storage-unavailable";
            "session-unavailable": "session-unavailable";
            "session-missing": "session-missing";
            "legacy-pending": "legacy-pending";
        }>;
    }, z.core.$strict>;
}, z.core.$strict>], "ok">;
export type TaskApiResult = z.infer<typeof taskApiResultSchema>;
