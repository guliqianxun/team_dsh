/** Team DSH owns a task list; DSH owns each task's native conversation. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-typert-registry'
import { TaskStore } from './tasks/store.js'
import { TaskApi } from './tasks/api.js'
import { TaskConversations } from './tasks/conversation.js'

/** Installed plugin identity. */
export const name = 'team-dsh'
/** Task editing is available even when Session services are absent. */
export const inject = ['storageDomain', 'typert']

/** @param ctx - Host services. @returns Resolution after the task API is available. */
export async function apply(ctx: Context): Promise<void> {
  await ctx.effect(async function* () {
    const store = await TaskStore.open(ctx)
    const api = new TaskApi(ctx, store)
    const conversations = new Set<TaskConversations>()
    let closing = false
    const drain = async () => {
      closing = true
      await Promise.all([api.close(), ...[...conversations].map(service => service.close())])
    }
    yield async () => { await drain(); await store.close() }
    yield ctx.provide('teamDshTaskStore', store)
    yield ctx.typert.register(TaskApi.remote)
    yield ctx.provide('teamDshTaskApi', api)
    const scope = ctx.inject(['sessionController', 'sessions', 'sessionPersistence', 'workingDirectory'], async sessionCtx => {
      if (closing) return
      await sessionCtx.effect(function* () {
        const service = new TaskConversations(sessionCtx, store)
        conversations.add(service)
        yield sessionCtx.provide('teamDshTaskConversations', service)
        yield async () => { try { await service.close() } finally { conversations.delete(service) } }
      })
    })
    yield scope.dispose
    yield drain
  })
}
