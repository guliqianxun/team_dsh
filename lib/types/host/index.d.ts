/** Team DSH owns a task list; DSH owns each task's native conversation. */
import type { Context } from '@deepseek-ai/cordis';
/** Installed plugin identity. */
export declare const name = "team-dsh";
/** Task editing is available even when Session services are absent. */
export declare const inject: string[];
/** @param ctx - Host services. @returns Resolution after the task API is available. */
export declare function apply(ctx: Context): Promise<void>;
