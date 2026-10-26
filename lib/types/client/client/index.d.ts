/** Register the task list and the Harness's native conversation. */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "team-dsh";
export declare const inject: string[];
declare module '@deepseek-ai/dsh-api-session-controller/client' {
    interface SessionReferenceSourceMap {
        teamDshTask: unknown;
        teamDshPet: unknown;
    }
}
/** @param ctx Context owning the page, transport observations and Session reference. */
export declare function apply(ctx: Context): void;
