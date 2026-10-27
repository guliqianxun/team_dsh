/** Readable measurements preserved in the native review message, with source mentions and event seqs. */
import { usageFields, type HistoryAnalysis } from '../shared/history.js'
import type { TaskLocaleKey } from './locales.js'

type Translate = (key: TaskLocaleKey) => string
// Names and IDs are data: they must not introduce extra native Session references.
const cell = (value: string | number) => String(value).replace(/dsh-session:/gu, 'dsh-session\u200b:')
  .replace(/[\\`*_[\]<>|]/gu, character => `\\${character}`).replace(/[\r\n]+/gu, ' ')
const table = (heading: string, rows: Array<Array<string | number>>) => [heading,
  `| ${heading.split('|').filter(value => value.trim()).map(() => '---').join(' | ')} |`,
  ...rows.map(row => `| ${row.map(cell).join(' | ')} |`)].join('\n')

/** @param sources Captured measurements in selected order. @param mentions Canonical native source links. @param t Active locale. @returns Source-separated tables; no cross-source sum that could double-count fork history. */
export function formatHistoryAnalysis(sources: readonly HistoryAnalysis[], mentions: readonly string[], t: Translate): string {
  const unknown = t('pet.analysis.unknown')
  const value = (number: number | null | undefined) => number ?? unknown
  const sections = sources.map((source, index) => {
    const tools = table(t('pet.analysis.toolsHeader'), source.tools.map(tool => [tool.name, tool.calls, tool.completed,
      tool.explicitErrors, tool.unfinished, tool.measuredDurations, value(tool.elapsedMs)]))
    const calls = (records: HistoryAnalysis['calls']) => table(t('pet.analysis.callsHeader'), records.map(call => [call.name, call.callId, call.callSeq,
      value(call.resultSeq), value(call.recoverySeq), call.resultSeq === null ? t('pet.analysis.unfinished') : call.explicitError ? t('pet.analysis.error') : t('pet.analysis.completed'), value(call.elapsedMs)]))
    const totals = table(t('pet.analysis.totalsHeader'), usageFields.map(field => {
      const bucket = source.usageTotals[field]
      return [t(`pet.analysis.${field}`), value(bucket.knownSum), bucket.reported, bucket.missing]
    }))
    const usage = (records: HistoryAnalysis['usage']) => table(t('pet.analysis.usageHeader'), records.map(record => [record.seq, record.turn, record.step,
      ...usageFields.map(field => value(record.usage?.[field]))]))
    const highlights = [
      ...(['errors', 'unfinished', 'slowest'] as const).flatMap(kind => source.highlights[kind].length
        ? [t(`pet.analysis.highlight.${kind}`), calls(source.highlights[kind])] : []),
      ...(source.highlights.largestUsage.length ? [t('pet.analysis.highlight.largestUsage'), usage(source.highlights.largestUsage)] : []),
    ]
    return [
      `### ${mentions[index]}`,
      `${t('pet.analysis.cutoff')}: ${source.capturedThroughSeq}; ${t('pet.analysis.inherited')}: ${source.inheritedEventCount}`,
      ...(highlights.length ? [`#### ${t('pet.analysis.highlights')}`, t('pet.analysis.highlightScope'), ...highlights] : []),
      `#### ${t('pet.analysis.details')}`,
      source.tools.length ? tools : t('pet.analysis.noTools'),
      `${t('pet.analysis.unmatched')}: ${source.unmatchedResults}`,
      `${t('pet.analysis.recovery')}: ${source.recoveryResults}`,
      source.calls.length ? calls(source.calls) : '',
      `${t('pet.analysis.omittedCalls')}: ${source.omittedCalls}`,
      totals, source.usage.length ? usage(source.usage) : t('pet.analysis.noUsage'),
      `${t('pet.analysis.omittedUsage')}: ${source.omittedUsage}`,
    ].filter(Boolean).join('\n\n')
  })
  return [`## ${t('pet.analysis.title')}`, t('pet.analysis.scope'), ...sections].join('\n\n')
}

/** @param sources Selected measurements. @param mentions Canonical source references. @param t Active locale. @param includeRecommendations Allows native market lookup after evidence-based need identification. @returns Instructions and measurements persisted by native Session submission; native tool events record later searches. */
export function formatHistoryPrompt(sources: readonly HistoryAnalysis[], mentions: readonly string[], t: Translate, includeRecommendations = false): string {
  const instructions = includeRecommendations ? [t('pet.market.prompt'), t('pet.prompt.evidence')]
    : [t('pet.prompt'), t('pet.prompt.evidence'), t('pet.prompt.actions')]
  return [`${t('pet.title')}: ${mentions.join(' · ')}`, ...instructions,
    formatHistoryAnalysis(sources, mentions, t)].join('\n\n')
}
