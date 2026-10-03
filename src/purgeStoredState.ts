/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PersistConfig } from './types'

import { KEY_PREFIX } from './constants'

export default function purgeStoredState(config: PersistConfig<any>):any {
  const storage = config.storage
  const storageKey = `${
    config.keyPrefix !== undefined ? config.keyPrefix : KEY_PREFIX
  }${config.key}`
  return storage.removeItem(storageKey, warnIfRemoveError)
}

function warnIfRemoveError(err: any) {
  if (err && process.env.NODE_ENV !== 'production') {
    console.error(
      'redux-persist/purgeStoredState: Error purging data stored state',
      err
    )
  }
}
