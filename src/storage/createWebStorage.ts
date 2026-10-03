import getStorage from './getStorage'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function createWebStorage(type: string): any {
  const storage = getStorage(type)
  return {
    getItem: (key: string): Promise<string> => {
      return new Promise((resolve) => {
        resolve(storage.getItem(key))
      })
    },
    setItem: (key: string, item: string): Promise<void> => {
      return new Promise((resolve) => {
        resolve(storage.setItem(key, item))
      })
    },
    removeItem: (key: string): Promise<void> => {
      return new Promise((resolve) => {
        resolve(storage.removeItem(key))
      })
    },
  }
}
