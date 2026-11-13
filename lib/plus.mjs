// dsh-whale-widget-plus —— 宿主侧增强层（plus）
// 目标：挂件显示的余额跟随「当前正在使用的供应商」，而不是写死的 DeepSeek 内置。
// 原则：零外部依赖；凭据只发往与 provider baseURL 同源的地址；任何异常 fail-soft 回退原行为。
import fs from 'node:fs'
import path from 'node:path'

const CFG_FILE = '.dshw-plus.json'
const DETECT_FILE = '.dshw-plus-detect.json'

export const DEFAULT_CFG = {
  version: 1,
  followActiveProvider: true,
  autoDetectBalanceEndpoint: true,
  fallbackToDeepSeek: true,
  cacheTtlMs: 25000,
  providers: {},
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (err) { return null }
}

function writeJson(p, obj) {
  try { fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8'); return true } catch (err) { return false }
}

export function readCfg(dshHome) {
  const j = readJson(path.join(dshHome, CFG_FILE))
  const out = Object.assign({}, DEFAULT_CFG)
  if (!j || typeof j !== 'object') return out
  if (typeof j.followActiveProvider === 'boolean') out.followActiveProvider = j.followActiveProvider
  if (typeof j.autoDetectBalanceEndpoint === 'boolean') out.autoDetectBalanceEndpoint = j.autoDetectBalanceEndpoint
  if (typeof j.fallbackToDeepSeek === 'boolean') out.fallbackToDeepSeek = j.fallbackToDeepSeek
  if (Number(j.cacheTtlMs) > 0) out.cacheTtlMs = Number(j.cacheTtlMs)
  if (j.providers && typeof j.providers === 'object') out.providers = j.providers
  return out
}
// 解析「当前正在使用的供应商」：读 profile 的 cordis.patch.yml 里 agent-default-model 段。
// 该配置是 DSH 真正的推理路由来源，与插件自己的注册表无关。
export function parseActive(dshHome) {
  const files = [
    path.join(dshHome, 'profiles', 'desktop', 'cordis.patch.yml'),
    path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml'),
  ]
  for (const f of files) {
    let src = ''
    try { src = fs.readFileSync(f, 'utf8') } catch (err) { continue }
    const lines = src.split(/\r?\n/)
    let inBlock = false
    let provider = ''
    let model = ''
    let baseURL = ''
    for (const line of lines) {
      if (/^\s*-\s*id:\s*agent-default-model\s*$/.test(line)) { inBlock = true; continue }
      if (!inBlock) continue
      if (/^\s*-\s*id:/.test(line)) break
      const m1 = line.match(/^\s+provider:\s*([A-Za-z0-9_.-]+)\s*$/)
      if (m1) { provider = m1[1]; continue }
      const m2 = line.match(/^\s+model:\s*([A-Za-z0-9_.:@-]+)\s*$/)
      if (m2) { model = m2[1]; continue }
    }
    if (provider) {
      // provider 的 baseURL 在同一文件的 providers: 段里
      const pv = src.split(new RegExp('^\\s{6}' + provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*$', 'm'))[1] || ''
      const mb = pv.match(/^\s+baseURL:\s*(\S+)\s*$/m)
      if (mb) baseURL = mb[1].replace(/['"]/g, '')
      return { provider, model, baseURL, from: f }
    }
  }
  return null
}
// 把「当前供应商」映射到注册表里的某条自定义模型。
// 优先级：配置显式映射 > 模型名等于 provider id > baseURL host 相同 > 只有一个非内置模型时直接用它。
export function pickModel(act, cfg, models) {
  if (!act || !act.provider) return null
  const list = (models || []).filter((m) => m && m.id && !m.builtin && m.id !== 'deepseek')
  if (!list.length) return null
  const map = (cfg && cfg.providers) || {}
  const explicit = map[act.provider] || map[act.provider.toLowerCase()]
  if (explicit) {
    const hit = list.find((m) => m.id === explicit)
    if (hit) return hit
  }
  const pid = String(act.provider).toLowerCase()
  const byName = list.find((m) => String(m.name || '').toLowerCase() === pid)
  if (byName) return byName
  const byHost = hostOf(act.baseURL)
  if (byHost) {
    const hit2 = list.find((m) => hostOf(m.baseUrl) === byHost)
    if (hit2) return hit2
  }
  return list.length === 1 ? list[0] : null
}

export function hostOf(u) {
  try {
    const p = new URL(String(u || ''))
    if (p.protocol !== 'http:' && p.protocol !== 'https:') return ''
    return p.hostname.toLowerCase()
  } catch (err) { return '' }
}
// 端点候选表：覆盖 Sub2API / New API / One API / OpenRouter 兼容几种常见形态。
// scale 是取值后乘数（例如 New API 的 quota 以 1/500000 美元为单位）。
const CANDS = [
  { url: '/v1/usage', json: 'remaining' },
  { url: '/v1/dashboard/billing/subscription', json: 'hard_limit_usd' },
  { url: '/v1/credits', json: 'data.total_credits' },
  { url: '/api/user/self', json: 'data.quota', scale: 0.000002 },
  { url: '/user/balance', json: 'balance_infos[0].total_balance' },
  { url: '/v1/balance', json: 'balance' },
]

export function pickJson(obj, p) {
  try {
    const parts = String(p || '').replace(/\[(\d+)\]/g, '.$1').split('.').filter((x) => x.length)
    let cur = obj
    for (const k of parts) {
      if (cur === null || cur === undefined) return undefined
      cur = cur[k]
    }
    return cur
  } catch (err) { return undefined }
}

function rootOf(baseURL) {
  return String(baseURL || '').replace(/\/+$/, '').replace(/\/v\d+$/, '')
}

export async function probeEndpoint(baseURL, key, timeoutMs) {
  const root = rootOf(baseURL)
  if (!root || !key) return null
  for (const c of CANDS) {
    const u = root + c.url
    try {
      const res = await fetch(u, {
        headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs || 8000),
      })
      if (!res.ok) continue
      const data = await res.json()
      const raw = pickJson(data, c.json)
      const n = Number(raw)
      if (!isFinite(n)) continue
      return { url: u, json: c.json, scale: c.scale || 1, sample: n }
    } catch (err) { continue }
  }
  return null
}
// plus 桥接层：给 lib/index.js 提供 apply(payload)，把顶部余额换成「当前供应商」的余额。
export function createPlusBridge(opts) {
  const o = opts || {}
  const dshHome = o.dshHome
  let mem = { at: 0, key: '', data: null }
  function log(m) { try { if (o.logger) o.logger('[whale-plus] ' + m) } catch (err) {} }

  // 端点来源：模型自带 balance.url 优先；否则按 provider baseURL 自动探测（结果缓存 24h）。
  async function endpointOf(model, act, cfg, key) {
    const b = (model && model.balance) || {}
    const path1 = (b.json && b.json.remaining) || 'remaining'
    if (b.url) return { url: b.url, json: path1, scale: 1, source: 'model' }
    if (!cfg.autoDetectBalanceEndpoint) return null
    const df = path.join(dshHome, DETECT_FILE)
    const cache = readJson(df) || {}
    const hit = cache[model.id]
    if (hit && hit.url && Date.now() - Number(hit.at || 0) < 86400000) return hit
    const probe = await probeEndpoint(model.baseUrl || act.baseURL, key, 8000)
    if (!probe) return null
    cache[model.id] = Object.assign({ at: Date.now() }, probe)
    writeJson(df, cache)
    log('自动探测到余额端点 ' + probe.url)
    return probe
  }
async function query(ep, key) {
    try {
      const res = await fetch(ep.url, {
        headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) { log('HTTP ' + res.status + ' @ ' + ep.url); return null }
      const data = await res.json()
      const raw = pickJson(data, ep.json)
      const n = Number(raw) * Number(ep.scale || 1)
      if (!isFinite(n)) { log('字段未命中 ' + ep.json); return null }
      return n
    } catch (err) { log('请求失败 ' + String((err && err.message) || err)); return null }
  }

  function merge(payload, d) {
    if (!payload || !d) return payload
    payload.ok = true
    const keys = Object.keys(d)
    for (const k of keys) payload[k] = d[k]
    return payload
  }

  async function apply(payload, force) {
    let cfg
    try { cfg = readCfg(dshHome) } catch (err) { return payload }
    if (!cfg.followActiveProvider) return payload
    const act = parseActive(dshHome)
    if (!act || !act.provider) return payload
    let models = []
    try { models = o.readRegistry().models || [] } catch (err) { models = [] }
    const model = pickModel(act, cfg, models)
    if (!model) { log('没有找到与 ' + act.provider + ' 对应的模型条目'); return payload }
    const ck = act.provider + '|' + model.id
    if (!force && mem.data && mem.key === ck && Date.now() - mem.at < cfg.cacheTtlMs) {
      return merge(payload, mem.data)
    }
const key = o.resolveKey ? await o.resolveKey(model.keyRef) : ''
    if (!key) { log('凭据 ' + (model.keyRef || '') + ' 解析为空'); return payload }
    const ep = await endpointOf(model, act, cfg, key)
    if (!ep) return payload
    const remaining = await query(ep, key)
    if (remaining === null) return payload
    let tu = { amount: 0, currency: model.currency || 'USD', source: 'none' }
    try { if (o.apiTodayUsage) tu = o.apiTodayUsage(model.id, model.currency) } catch (err) {}
    try { if (o.apiRecordBalance) o.apiRecordBalance(model.id, remaining) } catch (err) {}
    const data = {
      totalBalance: remaining,
      currency: model.currency || 'USD',
      bonusBalance: null,
      rechargeBalance: null,
      todayUsage: tu.amount,
      todayUsageCurrency: tu.currency || model.currency || 'USD',
      usageLabel: '余额差·' + (model.name || model.id),
      usageSource: tu.source || 'balance',
      activeProvider: act.provider,
      activeModel: model.id,
      activeEndpoint: ep.url,
    }
    mem = { at: Date.now(), key: ck, data }
    log('顶部余额已切换到 ' + act.provider + ' → ' + remaining + ' ' + data.currency)
    return merge(payload, data)
  }

  return { apply, status: function () { return Object.assign({ cachedAt: mem.at }, mem.data || {}) } }
}
