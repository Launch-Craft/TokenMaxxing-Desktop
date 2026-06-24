/**
 * Headless end-to-end smoke test of the local pipeline:
 * ScannerService → MemoryDataStore → MetricsService → AchievementEngine,
 * run against the REAL AI-tool data on this machine. Not shipped; dev-only.
 */
import { ScannerService } from '../src/main/scanner/ScannerService'
import { MetricsService } from '../src/main/services/MetricsService'
import { AchievementEngine } from '../src/main/services/AchievementEngine'
import { MemoryDataStore } from '../src/main/db/MemoryDataStore'
import { DEFAULT_SETTINGS } from '../src/shared/constants'

async function main(): Promise<void> {
  const store = new MemoryDataStore('/tmp/tm-smoke-store.json')
  const scanner = new ScannerService()
  scanner.onProgress((p) => process.stdout.write(`\r[scan] ${p.message.padEnd(48)}`))

  const result = await scanner.run(DEFAULT_SETTINGS, store)
  console.log('\n\n── scan result ──────────────────────────────')
  console.log('mode:', result.incremental ? 'INCREMENTAL' : 'FULL (first run)')
  console.log(
    'detected:',
    result.tools.filter((t) => t.detected).map((t) => `${t.toolName}(${t.sessionCount})`).join(', ') || 'none'
  )
  console.log(
    `sources: ${result.sourcesParsed} parsed · ${result.sourcesSkipped} cached · ${result.sourcesRemoved} removed`
  )
  console.log('total tokens:', result.totalTokens.toLocaleString())
  console.log('total sessions:', result.totalSessions)
  console.log('duration:', result.durationMs + 'ms')
  if (result.errors.length) console.log('notes:', result.errors.map((e) => `${e.toolId}: ${e.message}`).join(' | '))

  const metrics = new MetricsService()
  const snap = metrics.buildSnapshot(store)
  console.log('\n── dashboard snapshot ───────────────────────')
  console.log('tokens today/month (net):', snap.stats.tokensToday.toLocaleString(), '/', snap.stats.tokensThisMonth.toLocaleString())
  console.log('GROSS month/total (incl cache):', snap.stats.gross.month.toLocaleString(), '/', snap.stats.gross.total.toLocaleString())
  console.log('coding hours (month):', snap.stats.codingHours)
  console.log('streak current/longest:', snap.stats.currentStreak, '/', snap.stats.longestStreak)
  console.log('global rank (est):', snap.stats.globalRank)
  console.log(
    'est. spend  total/month/today: $' +
      snap.stats.spend.total.toFixed(2) +
      ' / $' +
      snap.stats.spend.month.toFixed(2) +
      ' / $' +
      snap.stats.spend.today.toFixed(2)
  )
  console.log('spend by model:', snap.modelCosts.map((m) => `${m.label}=$${m.costUsd.toFixed(0)}`).join(', '))
  console.log('tool breakdown (all-time):', snap.toolBreakdown.map((t) => `${t.toolName} ${t.percentage}%`).join(', ') || 'none')
  console.log('tool breakdown (today):', snap.toolBreakdownByPeriod.daily.map((t) => `${t.toolName} ${t.tokens.toLocaleString()} ($${t.costUsd.toFixed(0)})`).join(', ') || 'none')
  console.log('tool breakdown (this month):', snap.toolBreakdownByPeriod.monthly.map((t) => `${t.toolName} ${t.percentage}%`).join(', ') || 'none')
  console.log('daily points:', snap.series.daily.length, '| monthly:', snap.series.monthly.length)
  console.log('recent:', snap.recentSessions.slice(0, 3).map((s) => `${s.projectName}=${s.estimatedTokens.toLocaleString()}`).join(', '))

  const ag = snap.agentic
  console.log('\n── agentic activity ─────────────────────────')
  console.log('has data:', ag.hasData, '| agentic sessions:', ag.sessionsWithTools.toLocaleString())
  console.log('agents spawned:', ag.totalAgentsSpawned.toLocaleString(), `(avg ${ag.avgAgentsPerSession}/session, peak ${ag.maxAgentsInSession})`)
  console.log('workflows:', ag.totalWorkflows.toLocaleString())
  console.log('tool calls:', ag.totalToolCalls.toLocaleString(), `(avg ${ag.avgToolCallsPerSession}/session)`)
  console.log('tool-call accuracy:', ag.successRate + '%', `(${ag.totalToolErrors.toLocaleString()} errors / ${ag.totalToolResults.toLocaleString()} results)`)
  console.log('top tools:', ag.toolUsage.slice(0, 8).map((t) => `${t.name} ${t.calls.toLocaleString()} (${t.share}%)`).join(', ') || 'none')

  console.log('\n── recent sessions (what the row shows = estimatedTokens) ──')
  for (const s of snap.recentSessions.slice(0, 4)) {
    const b = s.tokenBreakdown
    console.log(
      `  ${s.projectName.padEnd(16)} shown=${s.estimatedTokens.toLocaleString()}  | input=${b.input.toLocaleString()} output=${b.output.toLocaleString()} cacheWrite=${b.cacheCreate.toLocaleString()} cacheRead=${b.cacheRead.toLocaleString()}  | input+output=${(b.input + b.output).toLocaleString()}`
    )
  }

  const list = new AchievementEngine(metrics).evaluate(store)
  console.log('\n── achievements ─────────────────────────────')
  console.log('unlocked:', list.filter((a) => a.unlocked).map((a) => a.name).join(', ') || 'none yet')
  console.log('store backend:', store.backend)
  console.log('\n✓ pipeline ran end-to-end')
}

main().catch((e) => {
  console.error('SMOKE FAILED:', e)
  process.exit(1)
})
