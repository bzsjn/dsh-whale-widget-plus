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