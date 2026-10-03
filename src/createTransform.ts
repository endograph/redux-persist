/* eslint-disable @typescript-eslint/no-explicit-any */
type TransformConfig = {
  whitelist?: Array<string>,
  blacklist?: Array<string>,
}

export default function createTransform(
  // @NOTE inbound: transform state coming from redux on its way to being serialized and stored
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  inbound: Function,
  // @NOTE outbound: transform state coming from storage, on its way to be rehydrated into redux
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  outbound: Function,
  config: TransformConfig = {}
): any {
  const whitelist = config.whitelist || null
  const blacklist = config.blacklist || null

  function whitelistBlacklistCheck(key: string) {
    if (whitelist && whitelist.indexOf(key) === -1) return true
    if (blacklist && blacklist.indexOf(key) !== -1) return true
    return false
  }

  return {
    in: (state: Record<string, unknown>, key: string, fullState: Record<string, unknown>) =>
      !whitelistBlacklistCheck(key) && inbound
        ? inbound(state, key, fullState)
        : state,
    out: (state: Record<string, unknown>, key: string, fullState: Record<string, unknown>) =>
      !whitelistBlacklistCheck(key) && outbound
        ? outbound(state, key, fullState)
        : state,
  }
}
