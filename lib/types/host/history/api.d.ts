/** Owner-only measurements of the exact source IDs submitted by the review picker. */
import { Service, type Context } from '@deepseek-ai/cordis';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types';
import { type HistoryResult } from '../shared/history.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        teamDshHistoryApi: HistoryApi;
    }
}
/** Failed or cancelled reads return no partial report; closing drains every observation lease. */
export declare class HistoryApi {
    readonly ctx: Context;
    static readonly remote: TypertContribution;
    readonly [Service.tracker]: {
        associate: string;
        property: string;
    };
    readonly typertRemote: import("@deepseek-ai/dsh-typert-protocol").TypertGatewayBinding<this>;
    private readonly active;
    private readonly shutdown;
    private disposal;
    /** @param ctx Scope retaining the native sessionQuery service throughout reads. */
    constructor(ctx: Context);
    /** @param request Explicit source selection. @param signal Caller cancellation. @returns Complete measurements or a stable failure code. */
    analyze(request: unknown, signal: AbortSignal): Promise<HistoryResult>;
    /** Cancel reads and wait for their leases before releasing the query dependency. */
    close(): Promise<void>;
    private read;
}
