/* eslint-disable @typescript-eslint/no-explicit-any */
import type { KeyAccessState, PersistConfig } from './types'

import { KEY_PREFIX } from './constants'

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
  return storage.getItem(storageKey).then((serialized: any) => {
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
