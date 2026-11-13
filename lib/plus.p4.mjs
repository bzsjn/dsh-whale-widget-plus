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