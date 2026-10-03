/* eslint-disable @typescript-eslint/no-explicit-any */
import getStoredStateV5 from '../getStoredState'

import type { KeyAccessState, PersistConfig, Storage, Transform } from '../types'

type V4Config = {
  storage?: Storage,
  serialize: boolean,
  keyPrefix?: string,
  transforms?: Array<Transform<any, any>>,
  blacklist?: Array<string>,
  whitelist?: Array<string>,
}

export default function getStoredState(v4Config: V4Config) {
  return function(v5Config: PersistConfig<any>): any {
    return getStoredStateV5(v5Config).then(state => {
      if (state) return state
      else return getStoredStateV4(v4Config)
    })
  }
}

const KEY_PREFIX = 'reduxPersist:'

function hasLocalStorage() {
  if (typeof self !== 'object' || !('localStorage' in self)) {
    return false
  }

  try {
    const storage = self.localStorage
    const testKey = `redux-persist localStorage test`
    storage.setItem(testKey, 'test')
    storage.getItem(testKey)
    storage.removeItem(testKey)
  } catch (e) {
    if (process.env.NODE_ENV !== 'production')
      console.warn(
        `redux-persist localStorage test failed, persistence will be disabled.`
      )
    return false
  }
  return true
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop = (...args: any) => {
  /* noop */ return null
}
const noStorage = {
  getItem: noop,
  setItem: noop,
  removeItem: noop,
  getAllKeys: noop,
  keys: []
}
const createAsyncLocalStorage = () => {
  if (!hasLocalStorage()) return noStorage
  const localStorage = self.localStorage
  return {
    getAllKeys: function(cb: any) {
      try {
        const keys = []
        for (let i = 0; i < localStorage.length; i++) {
          keys.push(localStorage.key(i))
        }
        cb(null, keys)
      } catch (e) {
        cb(e)
      }
    },
    getItem(key: string, cb: any) {
      try {
        const s = localStorage.getItem(key)
        cb(null, s)
      } catch (e) {
        cb(e)
      }
    },
    setItem(key: string, string: string, cb: any) {
      try {
        localStorage.setItem(key, string)
        cb(null)
      } catch (e) {
        cb(e)
      }
    },
    removeItem(key: string, cb: any) {
      try {
        localStorage.removeItem(key)
        cb && cb(null)
      } catch (e) {
        cb(e)
      }
    },
    keys: localStorage.keys
  }
}

function getStoredStateV4(v4Config: V4Config) {
  return new Promise((resolve, reject) => {
    let storage = v4Config.storage || createAsyncLocalStorage()
    const deserializer =
      v4Config.serialize === false
        ? (data: any) => data
        : (serial: string) => JSON.parse(serial)
    const blacklist = v4Config.blacklist || []
    const whitelist = v4Config.whitelist || false
    const transforms = v4Config.transforms || []
    const keyPrefix =
      v4Config.keyPrefix !== undefined ? v4Config.keyPrefix : KEY_PREFIX

    // fallback getAllKeys to `keys` if present (LocalForage compatability)
    if (storage.keys && !storage.getAllKeys)
      storage = { ...storage, getAllKeys: storage.keys }

    const restoredState: KeyAccessState = {}
    let completionCount = 0

    storage.getAllKeys((err: any, allKeys:string[] = []) => {
      if (err) {
        if (process.env.NODE_ENV !== 'production')
          console.warn(
            'redux-persist/getStoredState: Error in storage.getAllKeys'
          )
        return reject(err)
      }

      const persistKeys = allKeys
        .filter(key => key.indexOf(keyPrefix) === 0)
        .map(key => key.slice(keyPrefix.length))
      const keysToRestore = persistKeys.filter(passWhitelistBlacklist)

      const restoreCount = keysToRestore.length
      if (restoreCount === 0) resolve(undefined)
      keysToRestore.forEach(key => {
        storage.getItem(createStorageKey(key), (err: any, serialized: string) => {
          if (err && process.env.NODE_ENV !== 'production')
            console.warn(
              'redux-persist/getStoredState: Error restoring data for key:',
              key,
              err
            )
          else restoredState[key] = rehydrate(key, serialized)
          completionCount += 1
          if (completionCount === restoreCount) resolve(restoredState)
        })
      })
    })

    function rehydrate(key: string, serialized: string) {
      let state = null

      try {
        const data = serialized ? deserializer(serialized) : undefined
        state = transforms.reduceRight((subState, transformer) => {
          return transformer.out(subState, key, {})
        }, data)
      } catch (err) {
        if (process.env.NODE_ENV !== 'production')
          console.warn(
            'redux-persist/getStoredState: Error restoring data for key:',
            key,
            err
          )
      }

      return state
    }

    function passWhitelistBlacklist(key: string) {
      if (whitelist && whitelist.indexOf(key) === -1) return false
      if (blacklist.indexOf(key) !== -1) return false
      return true
    }

    function createStorageKey(key: string) {
      return `${keyPrefix}${key}`
    }
  })
}
