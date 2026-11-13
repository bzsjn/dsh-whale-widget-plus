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