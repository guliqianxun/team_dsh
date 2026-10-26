/** A movable entry to a native Session review, with metadata-only source selection. */
import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, DisclosureRow, Input, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { HistoryPetFace } from './history-controller.js'
import { readAppearance, readPetImage, saveAppearance, type PetAppearance } from './history-appearance.js'
import whaleImage from '../../assets/whale-idle.webp'
import css from './history-pet.module.css'

type Point = { x: number; y: number }
type Drag = Point & { pointerId: number; left: number; top: number; moved: boolean }
type Props = PropsRuntime<'shell.overlay'> & PropsLocale<'teamDsh'> & InjectFace<HistoryPetFace> & { refreshSessions(): Promise<void> }

function fit(point: Point, element: HTMLElement): Point {
  const viewport = window.visualViewport
  const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0
  const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight
  const { width: size, height: tall } = element.getBoundingClientRect()
  const clearance = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-top-clearance')) || 0
  const maxX = Math.max(left + 8, left + width - size - 8), maxY = Math.max(top + 8, top + height - tall - 8)
  return { x: Math.min(maxX, Math.max(left + 8, point.x)), y: Math.min(maxY, Math.max(Math.min(maxY, top + clearance + 8), point.y)) }
}

/** Keep the pet movable while the native Modal owns selection and keyboard focus. */
export function HistoryPet(props: Props) {
  const { t } = props
  const state = props.useHistoryPet(value => value)
  const sessions = props.useSessions(value => value)
  const running = props.useSessionStatus(value => state.sessionId !== null && value.get(state.sessionId)?.running === true)
  const [open, setOpen] = useState(false), [query, setQuery] = useState('')
  const [selection, setSelection] = useState<readonly SessionId[]>([])
  const [position, setPosition] = useState<Point | null>(null)
  const [refreshing, setRefreshing] = useState(false), [listError, setListError] = useState(false)
  const [appearance, setAppearance] = useState(readAppearance)
  const [appearanceOpen, setAppearanceOpen] = useState(false), [uploading, setUploading] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const upload = useRef<HTMLInputElement>(null), uploadVersion = useRef(0)
  const button = useRef<HTMLButtonElement>(null), drag = useRef<Drag | null>(null), suppressClick = useRef(false)
  const mounted = useRef(true), refreshVersion = useRef(0)
  const rows = sessions.ids.map(id => sessions.byId[id]!).filter(row => !row.blank && row.origin !== 'subagent' && row.formatStatus !== 'migration-required')
  const selected = selection.filter(id => rows.some(row => row.id === id))
  const matches = rows.filter(row => row.displayTitle.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  useEffect(() => {
    mounted.current = true
    const clamp = () => { const element = button.current; if (element) setPosition(previous => fit(previous ?? { x: element.getBoundingClientRect().left, y: element.getBoundingClientRect().top }, element)) }
    clamp()
    window.addEventListener('resize', clamp)
    window.visualViewport?.addEventListener('resize', clamp)
    window.visualViewport?.addEventListener('scroll', clamp)
    return () => { mounted.current = false; refreshVersion.current++; uploadVersion.current++; window.removeEventListener('resize', clamp); window.visualViewport?.removeEventListener('resize', clamp); window.visualViewport?.removeEventListener('scroll', clamp) }
  }, [])
  async function refresh() {
    const version = ++refreshVersion.current
    setRefreshing(true); setListError(false)
    try { await props.refreshSessions() }
    catch (_error) { if (mounted.current && version === refreshVersion.current) setListError(true) }
    finally { if (mounted.current && version === refreshVersion.current) setRefreshing(false) }
  }
  function show() { setOpen(true); void refresh() }
  async function submit(retry: boolean) {
    const accepted = await (retry ? props.retry() : props.start(selected))
    if (mounted.current && accepted) setOpen(false)
  }
  function chooseAppearance(value: PetAppearance) {
    uploadVersion.current++; setUploading(false)
    if (!saveAppearance(value)) { setAppearance(previous => ({ ...previous, error: 'save' })); return }
    setImageFailed(false); setAppearance({ value, error: null })
  }
  async function chooseImage(file: File) {
    const version = ++uploadVersion.current
    setUploading(true); setAppearance(previous => ({ ...previous, error: null }))
    const result = await readPetImage(file)
    if (!mounted.current || version !== uploadVersion.current) return
    setUploading(false)
    if ('error' in result) setAppearance(previous => ({ ...previous, error: result.error }))
    else chooseAppearance({ kind: 'custom', image: result.image })
  }
  const result = state.sessionId !== null && <Button onClick={() => { props.openResult(); setOpen(false) }}>{t(state.error ? 'pet.viewConversation' : 'pet.previous')}</Button>
  return <>
    <Tooltip label={t('pet.move')} side="top" portal disabled={open}>
      <button ref={button} className={css.pet} type="button" aria-label={t('pet.title')} aria-haspopup="dialog" aria-expanded={open}
        data-running={running} style={position ? { left: position.x, top: position.y, right: 'auto' } : undefined}
        onClick={event => { if (event.detail > 0 && suppressClick.current) { suppressClick.current = false; return } show() }}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return
          const rect = event.currentTarget.getBoundingClientRect()
          suppressClick.current = false
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          const start = drag.current
          if (!start || start.pointerId !== event.pointerId) return
          const dx = event.clientX - start.x, dy = event.clientY - start.y
          if (!start.moved && Math.hypot(dx, dy) < 5) return
          start.moved = true
          setPosition(fit({ x: start.left + dx, y: start.top + dy }, event.currentTarget))
        }}
        onPointerUp={event => {
          if (drag.current?.pointerId !== event.pointerId) return
          suppressClick.current = drag.current.moved; drag.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => { drag.current = null; suppressClick.current = true }}
        onLostPointerCapture={() => { if (drag.current) suppressClick.current = drag.current.moved; drag.current = null }}
        onKeyDown={event => {
          const delta = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key]
          if (!delta) return
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          setPosition(fit({ x: rect.left + delta[0]!, y: rect.top + delta[1]! }, event.currentTarget))
        }}>
        {appearance.value.kind === 'cat' ? <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path className={css.tail} d="M45 49c18 5 16-15 8-16" />
          <path className={css.cat} d="M17 29 13 10l16 9h8l14-9-3 20c5 6 5 17 0 23-6 7-27 7-33 0-5-7-4-17 2-24Z" />
          <path className={css.ears} d="m18 17 2 10 6-5m17 0 5-5-2 10" />
          <g className={css.eyes}><path d="M23 33v3m18-3v3" /></g>
          <path className={css.face} d="m30 39 2 2 2-2m-8 6q6 4 12 0M12 37l7 2m-8 4h8m26-4 7-2m-7 6h8" />
          <path className={css.book} d="m20 49 12 3 12-3v10l-12 3-12-3Zm12 3v10" />
        </svg> : <img src={appearance.value.kind === 'custom' && !imageFailed ? appearance.value.image! : whaleImage} alt="" draggable={false}
          onError={() => { if (appearance.value.kind === 'custom' && !imageFailed) { setImageFailed(true); setAppearance(previous => ({ ...previous, error: 'decode' })) } }} />}
      </button>
    </Tooltip>
    <Modal open={open} onClose={() => setOpen(false)} title={t('pet.title')} closeLabel={t('pet.close')} className={css.dialog!} contentClassName={css.content!}
      footer={<div className={css.actions}>{result}<Button variant="primary" disabled={state.busy || state.error === 'unknown' || selected.length === 0}
        onClick={() => { void submit(false) }}>{state.busy ? t('pet.starting') : t('pet.start')}</Button></div>}>
      <p className={css.limit}>{t('pet.limit')}</p>
      <Input className={css.search!} value={query} aria-label={t('pet.search')} placeholder={t('pet.search')} onChange={event => setQuery(event.currentTarget.value)} />
      {state.error && <div className={css.notice} role="alert"><span>{t(`pet.error.${state.error}`)}</span><Button disabled={state.busy} onClick={() => { void submit(true) }}>{t('retry')}</Button></div>}
      {listError && <div className={css.notice} role="alert"><span>{t('pet.error.list')}</span><Button disabled={refreshing} onClick={() => { void refresh() }}>{t('retry')}</Button></div>}
      {sessions.phase === 'pending' ? <div className={css.skeleton} role="status" aria-label={t('loading')}><span /><span /><span /></div>
        : <ul className={css.sessions}>{matches.map(row => <li key={row.id}>
          <Checkbox checked={selected.includes(row.id)} disabled={state.busy || state.error === 'unknown' || (!selected.includes(row.id) && selected.length >= 3)} label={row.displayTitle}
            onChange={checked => setSelection(checked ? [...selected, row.id] : selected.filter(id => id !== row.id))} />
          <div className={css.metadata}>
            <time dateTime={new Date(row.updatedAt).toISOString()}>{new Date(row.updatedAt).toLocaleString()}</time>
            <Button size="sm" variant="ghost" onClick={() => { props.openSource(row.id); setOpen(false) }}>{t('pet.viewConversation')}</Button>
          </div>
        </li>)}</ul>}
      {sessions.phase === 'ready' && matches.length === 0 && <p className={css.empty}>{t('pet.empty')}</p>}
      <DisclosureRow icon={null} title={t('pet.appearance')} open={appearanceOpen || appearance.error !== null} expandable expandOnRowClick
        onToggle={() => { setAppearanceOpen(!(appearanceOpen || appearance.error !== null)); if (appearance.error) setAppearance(previous => ({ ...previous, error: null })) }}>
        <div className={css.appearance}>
          <Button size="sm" variant={appearance.value.kind === 'whale' ? 'outline' : 'ghost'} aria-pressed={appearance.value.kind === 'whale'}
            onClick={() => chooseAppearance({ ...appearance.value, kind: 'whale' })}>{t('pet.whale')}</Button>
          <Button size="sm" variant={appearance.value.kind === 'cat' ? 'outline' : 'ghost'} aria-pressed={appearance.value.kind === 'cat'}
            onClick={() => chooseAppearance({ ...appearance.value, kind: 'cat' })}>{t('pet.cat')}</Button>
          {appearance.value.image && <Button size="sm" variant={appearance.value.kind === 'custom' ? 'outline' : 'ghost'} aria-pressed={appearance.value.kind === 'custom'}
            onClick={() => chooseAppearance({ ...appearance.value, kind: 'custom' })}>{t('pet.custom')}</Button>}
          <Button size="sm" disabled={uploading} onClick={() => upload.current?.click()}>{t('pet.upload')}</Button>
          <input ref={upload} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => {
            const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void chooseImage(file)
          }} />
        </div>
        {appearance.error && <p className={css.notice} role="alert">{t(`pet.appearanceError.${appearance.error}`)}</p>}
      </DisclosureRow>
    </Modal>
  </>
}
