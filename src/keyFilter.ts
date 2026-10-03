export interface KeyFilterConfig {
  allowlist?: ReadonlyArray<string>
  denylist?: ReadonlyArray<string>
  /** @deprecated use `allowlist` */
  whitelist?: ReadonlyArray<string>
  /** @deprecated use `denylist` */
  blacklist?: ReadonlyArray<string>
}

// Returns whether a top-level key passes the config's allowlist/denylist.
// whitelist/blacklist are the pre-v7 names for the same options; when both
// names are given, the new one wins.
export default function createKeyFilter(
  config: KeyFilterConfig,
  label: string,
  // keys that pass the allowlist even when it doesn't list them
  alwaysAllowed: ReadonlyArray<string> = []
): (key: string) => boolean {
  if (process.env.NODE_ENV !== 'production') {
    if (config.allowlist && config.whitelist)
      console.warn(`redux-persist: ${label} has both allowlist and whitelist; using allowlist.`)
    if (config.denylist && config.blacklist)
      console.warn(`redux-persist: ${label} has both denylist and blacklist; using denylist.`)
  }
  const allowlist = config.allowlist || config.whitelist || null
  const denylist = config.denylist || config.blacklist || null

  return (key: string) => {
    if (allowlist && allowlist.indexOf(key) === -1 && alwaysAllowed.indexOf(key) === -1)
      return false
    if (denylist && denylist.indexOf(key) !== -1) return false
    return true
  }
}
