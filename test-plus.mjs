// 自测：模拟宿主调用 plus.apply()，验证「当前供应商 = daapsaak」时顶部余额被切换。
// 只读本地配置与远端余额接口，不写任何业务文件（探测缓存除外，可用 --no-detect 关闭）。
import { createPlusBridge } from './lib/plus.mjs'
import fs from 'node:fs'
import path from 'node:path'

const HOME = process.env.DSH_HOME || path.join(process.env.USERPROFILE || '', '.dsh')
const KEYREF = process.env.PLUS_KEYREF || 'CC_SWITCH_DSH_DAAPSAAK'

function readCred(ref) {
  const raw = fs.readFileSync(path.join(HOME, '.credentials.yaml'), 'utf8')
  const m = raw.match(new RegExp('^\\s{2}' + ref + ':\\s*(\\S+)$', 'm'))
  return m ? m[1] : ''
}

const bridge = createPlusBridge({
  dshHome: HOME,
  readRegistry: () => JSON.parse(fs.readFileSync(path.join(HOME, '.dshw-api.json'), 'utf8')),
  apiModelById: () => null,
  apiTodayUsage: () => ({ amount: 0, currency: 'USD', source: 'none' }),
  apiRecordBalance: () => null,
  resolveKey: async () => readCred(KEYREF),
  logger: (m) => console.log(m),
})

const payload = { ok: true, totalBalance: 2.474223, currency: 'CNY' }
const out = await bridge.apply(payload, true)
console.log('=== 结果 ===')
console.log(JSON.stringify({
  totalBalance: out.totalBalance,
  currency: out.currency,
  todayUsage: out.todayUsage,
  activeProvider: out.activeProvider,
  activeModel: out.activeModel,
  activeEndpoint: out.activeEndpoint,
  usageLabel: out.usageLabel,
}, null, 2))