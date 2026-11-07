#!/usr/bin/env node
// dsh-check-action — run the DSH ENTRY checks on a plugin directory and render
// a human-readable advisory. Deterministic: no model calls, no per-run token.
//
// The report is the checker's own `dsh-conformance/1` JSON. From 1.2.0 on it
// carries an additive `advice[]` (one fix + docsUrl per finding); when an older
// checker omits it, the local rules/entry.json cards are used as a fallback.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const rules = JSON.parse(fs.readFileSync(path.join(here, '..', 'rules', 'entry.json'), 'utf8'))
const target = process.argv[2] || '.'
const failOn = process.env.DSH_CHECK_FAIL_ON || 'none'

// dsh-standards v1.6.6. The full commit is used so a moved tag can never change
// what the action runs; keep it in sync with DSH_CHECKER_REF in action.yml.
const REF = process.env.DSH_CHECKER_REF || '0fb3c5fde8509b9641d961cb2d0fe04c2e0f6fec'
const CHECKER_PATH = ['40-checker', 'bin', 'dsh-plugin-verify.mjs']

// The checker is fetched from codeload, so the action does not depend on an npm
// publish. DSH_CHECKER_DIR lets a local run point at a checkout instead.
function checkerScript() {
  if (process.env.DSH_CHECKER_DIR) return path.join(process.env.DSH_CHECKER_DIR, ...CHECKER_PATH)
  const root = path.join(process.env.RUNNER_TEMP || '/tmp', 'dsh-standards-' + REF)
  const script = path.join(root, ...CHECKER_PATH)
  if (fs.existsSync(script)) return script
  const dl = spawnSync('bash', ['-c', `curl -sSL --retry 3 https://codeload.github.com/PerryLink/dsh-standards/tar.gz/${REF} | tar xz -C "${path.dirname(root)}"`], { encoding: 'utf8', timeout: 180000 })
  if (dl.status !== 0 || !fs.existsSync(script)) return null
  return script
}

const script = checkerScript()
const hostVersion = (process.env.DSH_CHECK_HOST_VERSION || '').trim()

// `host-version` is optional. The raw checker in the 1.6.6 pin has no
// --host-version flag: its anchor flag is --runtime-version, and the
// author-facing `dsh-standards check` CLI maps --host-version onto exactly that.
// Probe `--help` instead of passing a flag blindly: an unknown option makes the
// checker exit 3 without a JSON report. A future pin that adds --host-version is
// forwarded verbatim; today's pin still gets the same anchor via
// --runtime-version.
function hostVersionArgs(scriptPath) {
  if (!hostVersion) return []
  if (!scriptPath) {
    // The npx fallback pins the same raw 1.6.6 checker, whose anchor flag is
    // --runtime-version; it has no --host-version.
    return ['--runtime-version', hostVersion]
  }
  const help = spawnSync(process.execPath, [scriptPath, '--help'], { encoding: 'utf8', timeout: 60000 })
  const usage = `${help.stdout || ''}\n${help.stderr || ''}`
  if (usage.includes('--host-version')) return ['--host-version', hostVersion]
  if (usage.includes('--runtime-version')) return ['--runtime-version', hostVersion]
  console.error(`dsh-check: checker accepts neither --host-version nor --runtime-version; ignoring host-version=${hostVersion}`)
  return []
}

const args = [target, '--scope', 'entry', '--entry-claim', 'static', '--format', 'json', ...hostVersionArgs(script)]
const run = script
  ? spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 })
  : spawnSync('npx', ['-y', '-p', 'dsh-standards@1.6.6', 'dsh-standards', ...args], { encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 })
let audit = null
try { audit = JSON.parse(run.stdout) } catch { /* handled below */ }

// The `advice` action output: the checker's additive advice[] as one JSON line.
// Written on the unparseable-report path too, so the composite step always has
// a file to publish instead of an empty output.
function writeAdvice(entries) {
  const out = process.env.DSH_CHECK_ADVICE_OUT
  if (!out) return
  try {
    fs.writeFileSync(out, JSON.stringify(entries) + '\n')
  } catch (error) {
    console.error(`dsh-check: cannot write DSH_CHECK_ADVICE_OUT: ${error.message}`)
  }
}

if (!audit || !Array.isArray(audit.checks)) {
  const lines = ['<!-- dsh-plugin-check -->', '## DSH plugin check\n', `检查器没有产出可解析结果（exit ${run.status ?? 'null'}）。`]
  if (run.stderr) lines.push('\n```\n' + String(run.stderr).slice(-800) + '\n```')
  writeAdvice([])
  console.log(lines.join('\n'))
  process.exit(0)
}

const checks = audit.checks
const failedChecks = checks.filter((c) => c.result === 'FAIL')
const warnChecks = checks.filter((c) => c.result === 'WARN')
const problems = [...failedChecks, ...warnChecks]
const status = audit.conclusion && audit.conclusion.status
const state = status === 'fail' || failedChecks.length > 0
  ? 'failed'
  : status === 'pass' || status === 'warn' ? 'recognized' : 'not-run'
const tag = (s) => ({ recognized: '已识别', failed: '未通过', incomplete: '不完整', 'not-run': '未运行' }[s] || s)
const advice = Array.isArray(audit.advice) ? audit.advice : []
writeAdvice(advice)

// 1.2.0 joins each FAIL/WARN detail (C-x.y) to a rule and reports it as one
// advice entry; `source` is the DSC check the detail belongs to. Anything that
// cannot supply a fix or a docs URL is treated as "no advice" so the legacy
// rule card still renders — an older checker must not break the action.
function adviceLines(problem) {
  const items = advice.filter((a) => a && a.source === problem.id && (a.fix || a.docsUrl))
  if (items.length === 0) return null
  const out = []
  for (const a of items) {
    const fix = Array.isArray(a.fix) ? a.fix.join('；') : a.fix
    const key = a.key && a.key !== a.title ? `${a.key} ` : ''
    out.push(`- **${key}${a.title || problem.id}**（${a.source || problem.id} · ${a.severity || 'WARN'}）`)
    const reason = a.reason || problem.reason
    if (reason) out.push(`  - 问题：${reason}`)
    if (a.why) out.push(`  - 为什么：${a.why}`)
    if (fix) out.push(`  - 修复：${fix}`)
    if (a.docsUrl) out.push(`  - 参考：${a.docsUrl}`)
  }
  return out
}

function legacyLines(problem) {
  const rule = rules[problem.id]
  if (!rule) return [`- **${problem.id}** ${problem.reason} [no-template]`]
  const out = [`- **${problem.id} ${rule.title}**`, `  - 为什么：${rule.why}`]
  rule.fix.forEach((s, i) => out.push(`  - ${i + 1}. ${s}`))
  if (rule.example) out.push(`  - 例：\`${rule.example}\``)
  if (rule.values) out.push(`  - 可选值：${rule.values}`)
  out.push(`  - 参考：${rule.anchor}`)
  return out
}

const lines = []
lines.push('<!-- dsh-plugin-check -->')
lines.push('## DSH plugin check（ENTRY，只读）')
lines.push('')
lines.push(`- ENTRY: **${tag(state)}**（静态，未做真实启动）`)
lines.push('- FLOW: **未跑** —— 这里不做安装或启动，所以不给结论')
lines.push('- BOOST: **未测** —— 没有证据卡就不打分')
lines.push('')
if (problems.length === 0) {
  lines.push('没有需要改的项。')
} else {
  lines.push('### 建议')
  lines.push('')
  for (const p of problems) lines.push(...(adviceLines(p) || legacyLines(p)))
}
lines.push('')
lines.push('_社区草案，非官方、不认证、不排名；这是提醒，不是判定。_')
const md = lines.join('\n')
console.log(md)
if (failOn === 'entry' && failedChecks.length > 0) process.exit(1)
