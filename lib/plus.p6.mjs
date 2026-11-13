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