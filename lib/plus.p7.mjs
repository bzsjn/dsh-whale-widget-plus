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