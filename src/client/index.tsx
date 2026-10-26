/** Register the task list and the Harness's native conversation. */
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { IconChecklistOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-session-reference/remote'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { taskApiResultSchema } from '../shared/task.js'
import { TaskController, type TaskServices } from './controller.js'
import { TaskConversation, TaskPanel } from './panel.js'
import { en, zh } from './locales.js'
import { cssText } from './panel.module.css'
import { HistoryPetController } from './history-controller.js'
import { HistoryPet } from './history-pet.js'
import { cssText as petCssText } from './history-pet.module.css'

export const name = 'team-dsh'
export const inject = ['slots', 'locale', 'layout', 'connection', 'sessions', 'uiSession', 'uiConversation', 'uiWorkspace',
  'remote', 'remote.session', 'remote.sessionReferenceResolver']

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { teamDshTask: unknown; teamDshPet: unknown }
}

/** @param ctx Context owning the page, transport observations and Session reference. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = cssText + petCssText; document.head.append(style)
    return () => style.remove()
  }, 'team-dsh: styles')
  ctx.effect(() => ctx.locale.register('teamDsh', { en, zh }), 'team-dsh: dictionaries')
  const connection = ctx.get('connection', true)
  const request: TaskServices['request'] = async (request, signal) => {
    const reply = await connection.rpc.call('/api', 'teamDshTaskApi/request', { args: { request } }, signal)
    signal.throwIfAborted()
    if (!reply.ok) {
      if (reply.error.code === 'forbidden' || reply.error.code === 'remote-access/denied') return { ok: false, error: { code: 'forbidden' } }
      throw new Error('Task response unavailable')
    }
    return taskApiResultSchema.parse(reply.value)
  }
  const controller = new TaskController({ connection, request,
    retain: (sessionId, signal) => ctx.sessions.retain(sessionId, { source: 'teamDshTask', signal }),
    newRequestId: () => crypto.randomUUID(),
  })
  ctx.effect(() => () => controller.dispose(), 'team-dsh: task controller')
  const panelId = brandString<MainPanelId>('team-dsh-tasks')
  const syncActivity = () => controller.setActive(ctx.layout.panelInfo.getSnapshot().activePanelId === panelId)
  ctx.effect(() => ctx.layout.panelInfo.subscribe(syncActivity), 'team-dsh: panel activity')
  syncActivity()
  const face = controller.face()
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: panelId, locale: 'teamDsh', inject: () => face,
    children: { 'teamDsh.task.conversation': { kind: 'single', scope: 'session' } },
  }, TaskPanel))
  ctx.slots.inject('teamDsh.task.conversation', () => ctx.slots.register({ name: 'teamDsh.task.conversation' }, TaskConversation))
  const t = ctx.locale.bind('teamDsh')
  const pet = new HistoryPetController({
    sessions: ctx.sessions,
    hasSession: async (id, signal) => {
      const result = await ctx.remote.session.list({}, signal)
      if (!result.ok) throw new Error('Conversation list unavailable')
      return result.value.items.some(item => item.sessionId === id)
    },
    mentions: async (targetId, sourceId, signal) => {
      const result = await ctx.remote.sessionReferenceResolver.candidates(targetId, sourceId, signal)
      if (!result.ok) throw new Error('Conversation references unavailable')
      return result.value
    },
    openSession: id => ctx.uiWorkspace.openSession(id),
    newSessionId: () => brandString<SessionId>(crypto.randomUUID()),
    prompt: mentions => `${t('pet.title')}: ${mentions.join(' · ')}\n\n${t('pet.prompt')}`,
  })
  ctx.effect(() => () => pet.dispose(), 'team-dsh: history pet')
  const refresh = new AbortController()
  ctx.effect(() => () => refresh.abort(), 'team-dsh: pet catalog')
  const petFace = { ...pet.face(), refreshSessions: async () => {
    const result = await ctx.remote.session.list({}, refresh.signal)
    if (!result.ok) throw new Error('Conversation list unavailable')
    refresh.signal.throwIfAborted()
    await ctx.sessions.refresh()
  } }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'team-dsh.history-pet',
    locale: 'teamDsh', inject: () => petFace,
  }, HistoryPet))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: panelId,
    order: 1, label: () => t('title'), locale: 'teamDsh',
  }, IconChecklistOutlineRegular))
}
