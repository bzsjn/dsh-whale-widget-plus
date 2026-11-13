# dsh-whale-widget-plus

小鲸鱼挂件 **plus** 版。基于 `dsh-whale-widget@0.4.2`，保留原版全部能力，追加三件事：

1. **顶部余额跟随当前供应商**：小鲸鱼身上那个数字不再是写死的 DeepSeek 余额，而是「你现在正在用的 provider」的余额。
2. **余额端点自动探测**：新加一个中转站，不用手填 `balance.url` 与 JSON 路径；插件自己试常见形态并缓存结果 24h。
3. **失败回退**：任一步失败（无 key / 端点不通 / 字段不命中）都原样保留 DeepSeek 余额，不会显示 0 或「—」。

## 原理

原版 `lib/index.js` 的 `fetchBalance()` 只走 `api.deepseek.com/user/balance` 或 DSH 账号服务，与 LLM 路由无关。plus 在 `getBalance()` 之后插一层 `apply(payload)`：

```
balance.json handler
  └─ getBalance()            # 原版：DeepSeek 余额（含记账）
       └─ plus.apply()       # plus：若配置开启，则用当前供应商余额覆盖显示值
```

覆盖只影响**显示**：`recordLedgerUsage()` 早已在 `getBalance()` 内部按 DeepSeek 口径记完，账本不受污染。

## 配置

`$DSH_HOME/.dshw-plus.json`（可选，缺失即全默认）：

```json
{
  "version": 1,
  "followActiveProvider": true,
  "autoDetectBalanceEndpoint": true,
  "fallbackToDeepSeek": true,
  "cacheTtlMs": 25000,
  "providers": {
    "daapsaak": "api_mwedhg10_gqhah"
  }
}
```

| 字段 | 默认 | 作用 |
|---|---|---|
| `followActiveProvider` | `true` | 总开关。`false` = 与原版行为一致 |
| `autoDetectBalanceEndpoint` | `true` | 模型没配 `balance.url` 时自动探测 |
| `fallbackToDeepSeek` | `true` | 取不到就用原版数字（预留给更激进的策略，目前失败总是回退） |
| `cacheTtlMs` | `25000` | 内存缓存，避免每次刷新都打接口 |
| `providers` | `{}` | 显式映射 `providerId → 模型id`，留空则按名字/host 自动匹配 |

## 当前供应商怎么判定

读 `profiles/<profile>/cordis.patch.yml` 里 `agent-default-model` 段的 `provider` 与 `model`——与 DSH 的推理路由同源，不猜。

模型匹配顺序：`providers` 显式映射 → 注册表 `name` 等于 provider id → `baseUrl` host 与 provider `baseURL` host 相同 → 只有一个非内置模型时直接用它。

## 自动探测的端点形态

```
/v1/usage                                   → remaining              (Sub2API)
/v1/dashboard/billing/subscription          → hard_limit_usd         (New API / One API)
/v1/credits                                 → data.total_credits     (OpenRouter)
/api/user/self                              → data.quota (×0.000002) (New API)
/user/balance                               → balance_infos[0].total_balance
/v1/balance                                 → balance
```

探测会先剥掉 baseURL 尾部的 `/v1`，再按上表拼；命中后写 `$DSH_HOME/.dshw-plus-detect.json`（含 url/json/scale/时间），24 小时内不再探。

## 安全边界

- 凭据只发给与 provider `baseURL` **同源**的地址；探测候选路径基于该 baseURL 拼接，不跳域名。
- `.dshw-plus.json` 与 `.dshw-plus-detect.json` 都不含密钥；密钥仍走 DSH 凭据（`ctx.credentials.resolve(keyRef)`）。
- 覆盖只改内存里返回给前端的对象，不落盘、不改 `.dshw-api.json`。

## 安装

```bash
dsh plugin --profile desktop add dsh-whale-widget-plus
```

本地开发：

```bash
dsh plugin --profile desktop add link:<本目录绝对路径>
```

装完重启 DSH（宿主侧 `lib/` 改动不热重载）。

## 自测

```bash
node test-plus.mjs
```

会模拟宿主调用 `plus.apply()`，打印切换后的 `totalBalance / currency / activeProvider / activeEndpoint`。

## 与上游关系

原版：<https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget>（MIT）。
本仓库是 fork 增强，**不是**上游维护的版本；上游升级时请自行比对本仓库的三处注入点：

- `lib/index.js` 顶部 `import { createPlusBridge } from './plus.mjs'`
- `fetchModelBalance()` 之后创建 `const plus = createPlusBridge({...})`
- `/dsh-whale/balance.json` handler 里 `await plus.apply(payload, refresh)`

`lib/plus.mjs` 是独立文件，可整块搬走。

## License

MIT，见 `LICENSE`。上游版权归原作者，plus 增补部分同许可。