/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Transform, TransformInbound, TransformOutbound } from './types'

type TransformConfig = {
  whitelist?: Array<string>,
  blacklist?: Array<string>,
}

export default function createTransform<HSS, ESS, S = any, RS = any>(
  // @NOTE inbound: transform state coming from redux on its way to being serialized and stored
  inbound?: TransformInbound<HSS, ESS, S> | null,
  // @NOTE outbound: transform state coming from storage, on its way to be rehydrated into redux
  outbound?: TransformOutbound<ESS, HSS, RS> | null,
  config: TransformConfig = {}
): Transform<HSS, ESS, S, RS> {
  const whitelist = config.whitelist || null
  const blacklist = config.blacklist || null

  function whitelistBlacklistCheck(key: string) {
    if (whitelist && whitelist.indexOf(key) === -1) return true
    if (blacklist && blacklist.indexOf(key) !== -1) return true
    return false
  }

  // Keys skipped by whitelist/blacklist pass through unchanged
  return {
    in: (state: HSS, key: keyof S, fullState: S): ESS =>
      !whitelistBlacklistCheck(key as string) && inbound
        ? inbound(state, key, fullState)
        : (state as any),
    out: (state: ESS, key: keyof RS, fullState: RS): HSS =>
      !whitelistBlacklistCheck(key as string) && outbound
        ? outbound(state, key, fullState)
        : (state as any),
  }
}
