import getStorage from './getStorage'
import type { Storage } from '../types'

// The underlying storage is looked up on first use rather than when this
// module is imported, so importing it on the server has no side effects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function createWebStorage(type: string): any {
  let storage: Storage | null = null
  const resolveStorage = () => storage || (storage = getStorage(type))
  return {
    getItem: (key: string): Promise<string> => {
      return new Promise((resolve) => {
        resolve(resolveStorage().getItem(key))
      })
    },
    setItem: (key: string, item: string): Promise<void> => {
      return new Promise((resolve) => {
        resolve(resolveStorage().setItem(key, item))
      })
    },
    removeItem: (key: string): Promise<void> => {
      return new Promise((resolve) => {
        resolve(resolveStorage().removeItem(key))
      })
    },
  }
}
