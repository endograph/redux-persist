/* eslint-disable @typescript-eslint/no-explicit-any */
import type { KeyAccessState, PersistConfig } from './types.js'

import { KEY_PREFIX } from './constants.js'

export default function getStoredState(
  config: PersistConfig<any>
): Promise<any | void> {
  const transforms = config.transforms || []
  const storageKey = `${
    config.keyPrefix !== undefined ? config.keyPrefix : KEY_PREFIX
  }${config.key}`
  const storage = config.storage
  const debug = config.debug
  let deserialize: (x: any) => any
  if (config.deserialize === false) {
    deserialize = (x: any) => x
  } else if (typeof config.deserialize === 'function') {
    deserialize = config.deserialize
  } else {
    deserialize = defaultDeserialize
  }
  // a storage engine may return a value instead of a promise, or throw
  return new Promise<any>(resolve => {
    const result = storage.getItem(storageKey)
    // a getItem(key, callback) that returns nothing is a callback-style
    // engine; taking that for empty storage would replace the stored data
    if (result === undefined && storage.getItem.length > 1)
      throw new Error(
        'redux-persist: storage.getItem returned nothing. It must return the stored value or a promise of it; callback-style storage engines are not supported.'
      )
    resolve(result)
  }).then((serialized: any) => {
    if (!serialized) return undefined
    else {
      try {
        const state: KeyAccessState = {}
        const rawState = deserialize(serialized)
        Object.keys(rawState).forEach(key => {
          state[key] = transforms.reduceRight((subState, transformer) => {
            return transformer.out(subState, key, rawState)
          }, deserialize(rawState[key]))
        })
        return state
      } catch (err) {
        if (process.env.NODE_ENV !== 'production' && debug)
          console.log(
            `redux-persist/getStoredState: Error restoring data ${serialized}`,
            err
          )
        throw err
      }
    }
  })
}

function defaultDeserialize(serial: string) {
  return JSON.parse(serial)
}
