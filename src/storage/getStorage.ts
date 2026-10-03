import type { Storage } from '../types.js'

function noop() {}
const noopStorage = {
  getItem: noop,
  setItem: noop,
  removeItem: noop,
  keys: [],
  getAllKeys: noop,
}

// Web storage lives on `window`. Without one (server rendering, web workers)
// there is nothing to persist to, which is expected, so use noop storage
// without a warning. Node 25+ defines a global localStorage that is shared by
// every request on the server; it is deliberately not used.
export default function getStorage(type: string): Storage {
  const storageType = `${type}Storage`
  if (typeof window !== 'object' || window === null) return noopStorage

  try {
    const storage = (window as unknown as { [key: string]: Storage })[storageType]
    const testKey = `redux-persist ${storageType} test`
    storage.setItem(testKey, 'test')
    storage.getItem(testKey)
    storage.removeItem(testKey)
    return storage
  } catch {
    // missing, or blocked by the browser (privacy settings, some private modes)
    if (process.env.NODE_ENV !== 'production')
      console.warn(
        `redux-persist: ${storageType} is not available (it may be blocked by the browser's settings), so state won't be persisted.`
      )
    return noopStorage
  }
}
