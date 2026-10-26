/** A task list opens the Harness's own conversation and composer. */
import { useEffect, useRef } from 'react'
import { Button, Checkbox, IconLoadingOutlineRegular, Input, observeComposition } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TaskFace } from './controller.js'
import css from './panel.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'teamDsh.task.conversation': { kind: 'single'; scope: 'session'; owner: Record<never, never> }
  }
}

type PanelProps = InjectFace<TaskFace> & PropsLocale<'teamDsh'> & PropsRenderSlots<'teamDsh.task.conversation'>

/** Render the native chat assembly inside the selected Session scope. */
export function TaskConversation({ renderFactorySlot }: PropsRuntime<'teamDsh.task.conversation'> & PropsRenderFactories) {
  return renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false })
}

/** Display one-line creation, manual completion, and the selected conversation. */
export function TaskPanel(props: PanelProps) {
  const { t, SessionProvider, renderSlot } = props
  const state = props.useTasks(value => value)
  const input = useRef<HTMLInputElement>(null)
  const composition = useRef<ReturnType<typeof observeComposition> | null>(null)
  useEffect(() => {
    const guard = observeComposition(document)
    composition.current = guard
    return () => { composition.current = null; guard.dispose() }
  }, [])
  const selected = state.tasks?.find(task => task.taskId === state.selectedId)
  const disabled = !state.connected || state.storageId === null || state.saving || state.pending !== null
  const error = !state.connected ? 'connection' : state.error

  return <main className={css.page} data-team-dsh-tasks="">
    {selected ? <>
      <header className={css.heading}>
        <Button variant="ghost" onClick={props.back}>{t('back')}</Button>
        <h1>{selected.title}</h1>
        <Checkbox checked={selected.done} disabled={disabled} onChange={done => { void props.setDone(selected.taskId, done) }} label={t('done')} />
      </header>
      {error && <div className={css.notice} role="alert"><span>{t(`error.${error}`)}</span>
        <Button disabled={!state.connected || state.loading || state.saving} onClick={() => { void (state.pending ? props.retryWrite() : props.refreshTasks()) }}>{t('retry')}</Button></div>}
      {state.sessionError && <div className={css.notice} role="alert"><span>{t(`error.${state.sessionError}`)}</span>
        <Button disabled={!state.connected || state.opening} onClick={() => { void props.openTask(selected.taskId) }}>{t('retry')}</Button></div>}
      {state.opening && <div className={css.loading} role="status" aria-label={t('loading')}><IconLoadingOutlineRegular /></div>}
      {state.reference !== null && <div className={css.conversation}>
        <SessionProvider session={state.reference}>{renderSlot('teamDsh.task.conversation', {})}</SessionProvider>
      </div>}
    </> : <section className={css.list} aria-label={t('title')}>
      <div className={css.capture}>
        <Input ref={input} className={css.input!} aria-label={t('newTask')} placeholder={t('newTask')}
          value={state.draft} disabled={state.pending === 'create'} onChange={event => props.setDraft(event.currentTarget.value)}
          onKeyDown={event => {
            if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || composition.current?.guards(event.nativeEvent)) return
            event.preventDefault()
            if (!disabled && state.draft.trim()) void props.createTask()
          }} />
        <Button variant="primary" disabled={disabled || !state.draft.trim()} onClick={() => { void props.createTask() }}>{t('add')}</Button>
      </div>
      {error && <div className={css.notice} role="alert"><span>{t(`error.${error}`)}</span>
        <Button disabled={!state.connected || state.loading || state.saving} onClick={() => { void (state.pending ? props.retryWrite() : props.refreshTasks()) }}>{t('retry')}</Button></div>}
      {state.tasks === null && state.loading ? <div className={css.skeleton} role="status" aria-label={t('loading')}>
        <span /><span /><span />
      </div> : <ul className={css.rows}>
        {state.tasks?.map(task => <li key={task.taskId} className={css.row}>
          <Checkbox className={css.toggle} checked={task.done} disabled={disabled}
            onChange={done => { void props.setDone(task.taskId, done) }} label={t('markDone').replace('{title}', task.title)} />
          <button type="button" className={css.task} disabled={!state.connected} onClick={() => { void props.openTask(task.taskId) }}>{task.title}</button>
        </li>)}
      </ul>}
    </section>}
  </main>
}
