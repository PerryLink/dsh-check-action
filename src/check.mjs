#!/usr/bin/env node
// dsh-check-action — run the DSH ENTRY checks on a plugin directory and render
// a human-readable advisory. Deterministic: no model calls, no per-run token.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const rules = JSON.parse(fs.readFileSync(path.join(here, '..', 'rules', 'entry.json'), 'utf8'))
const target = process.argv[2] || '.'
const failOn = process.env.DSH_CHECK_FAIL_ON || 'none'

// The checker is pinned to a commit and fetched from codeload, so the action
// does not depend on an npm publish. DSH_CHECKER_DIR lets a local run point at
// a checkout instead.
const REF = process.env.DSH_CHECKER_REF || 'aa0a25c'
function checkerScript() {
  if (process.env.DSH_CHECKER_DIR) return path.join(process.env.DSH_CHECKER_DIR, '40-checker', 'scripts', 'level-audit.mjs')
  const root = path.join(process.env.RUNNER_TEMP || '/tmp', 'dsh-standards-' + REF)
  const script = path.join(root, '40-checker', 'scripts', 'level-audit.mjs')
  if (fs.existsSync(script)) return script
  const dl = spawnSync('bash', ['-c', `curl -sSL --retry 3 https://codeload.github.com/PerryLink/dsh-standards/tar.gz/${REF} | tar xz -C "${path.dirname(root)}"`], { encoding: 'utf8', timeout: 180000 })
  if (dl.status !== 0 || !fs.existsSync(script)) return null
  return script
}
const script = checkerScript()
const r = script
  ? spawnSync('node', [script, target, '--no-runtime', '--format', 'json'], { encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 })
  : spawnSync('npx', ['-y', '-p', 'dsh-standards@1.0.3', 'dsh-levels', target, '--no-runtime', '--format', 'json'], { encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 })
let audit = null
try { audit = JSON.parse(r.stdout) } catch { /* handled below */ }
if (!audit || !audit.levels) {
  console.log('<!-- dsh-plugin-check -->')
  console.log('## DSH plugin check\n')
  console.log(`检查器没有产出可解析结果（exit ${r.status}）。`)
  console.log(r.stderr ? '\n```\n' + String(r.stderr).slice(-800) + '\n```' : '')
  process.exit(0)
}

const L = audit.levels
const problems = [...(L.entry.failed || []), ...(L.entry.warnings || [])]
const tag = (s) => ({ recognized: '已识别', failed: '未通过', incomplete: '不完整' }[s] || s)
const lines = []
lines.push('<!-- dsh-plugin-check -->')
lines.push('## DSH plugin check（ENTRY，只读）')
lines.push('')
lines.push(`- ENTRY: **${tag(L.entry.state)}**（静态，未做真实启动）`)
lines.push(`- FLOW: **未跑** —— 这里不做安装或启动，所以不给结论`)
lines.push(`- BOOST: **未测** —— 没有证据卡就不打分`)
lines.push('')
if (problems.length === 0) {
  lines.push('没有需要改的项。')
} else {
  lines.push('### 建议')
  lines.push('')
  for (const p of problems) {
    const rule = rules[p.id]
    if (!rule) { lines.push(`- **${p.id}** ${p.reason} [no-template]`); continue }
    lines.push(`- **${p.id} ${rule.title}**`)
    lines.push(`  - 为什么：${rule.why}`)
    rule.fix.forEach((s, i) => lines.push(`  - ${i + 1}. ${s}`))
    if (rule.example) lines.push(`  - 例：\`${rule.example}\``)
    if (rule.values) lines.push(`  - 可选值：${rule.values}`)
    lines.push(`  - 参考：${rule.anchor}`)
  }
}
lines.push('')
lines.push('_社区草案，非官方、不认证、不排名；这是提醒，不是判定。_')
const md = lines.join('\n')
console.log(md)
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'markdown<<DSH_EOF\n' + md + '\nDSH_EOF\n')
const failed = (L.entry.failed || []).length
if (failOn === 'entry' && failed > 0) process.exit(1)
