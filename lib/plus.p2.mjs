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