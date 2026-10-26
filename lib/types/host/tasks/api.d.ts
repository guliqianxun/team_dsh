/** Owner-only task operations exposed through the DSH Gateway. */
import { Service, type Context } from '@deepseek-ai/cordis';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types';
import { type TaskApiResult } from '../shared/task.js';
import { type TaskStore } from './store.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        teamDshTaskApi: TaskApi;
        teamDshTaskStore: TaskStore;
    }
}
/** Admitted writes finish even when the caller disconnects. */
export declare class TaskApi {
    readonly ctx: Context;
    private readonly store;
    static readonly remote: TypertContribution;
    readonly [Service.tracker]: {
        associate: string;
        property: string;
    };
    readonly typertRemote: import("@deepseek-ai/dsh-typert-protocol").TypertGatewayBinding<this>;
    private readonly active;
    private closing;
    private disposal;
    /** @param ctx - Host invocation context. @param store - Retained task storage. */
    constructor(ctx: Context, store: TaskStore);
    /** @param request - JSON request. @param signal - Cancellation checked before admission. @returns Acknowledged task facts or a localized error code. */
    request(request: unknown, signal: AbortSignal): Promise<TaskApiResult>;
    /** Refuse new requests and drain admitted work. @returns Shared drain completion. */
    close(): Promise<void>;
    private perform;
}
