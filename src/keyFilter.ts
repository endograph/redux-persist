// The top-level keys to match, or a function that is called with each key
export type KeyFilter = ReadonlyArray<string> | ((key: string) => boolean)

export interface KeyFilterConfig {
  allowlist?: KeyFilter
  denylist?: KeyFilter
  /** @deprecated use `allowlist` */
  whitelist?: ReadonlyArray<string>
  /** @deprecated use `denylist` */
  blacklist?: ReadonlyArray<string>
}

const matches = (filter: KeyFilter, key: string): boolean =>
  typeof filter === 'function' ? !!filter(key) : filter.indexOf(key) !== -1

// Returns whether a top-level key passes the config's allowlist/denylist.
// whitelist/blacklist are the pre-v7 names for the same options; when both
// names are given, the new one wins.
export default function createKeyFilter(
  config: KeyFilterConfig,
  label: string,
  // keys that always pass, whatever the lists say (and that a function
  // allowlist or denylist is never called with)
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
    if (alwaysAllowed.indexOf(key) !== -1) return true
    if (allowlist && !matches(allowlist, key)) return false
    if (denylist && matches(denylist, key)) return false
    return true
  }
}
