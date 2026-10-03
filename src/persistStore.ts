/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  Persistor,
  PersistorOptions,
  PersistorState,
} from './types'

import { AnyAction, createStore, Store } from 'redux'
import { FLUSH, PAUSE, PERSIST, PURGE, REGISTER, REHYDRATE } from './constants'
import { attachHandle } from './persistorHandle'

type BoostrappedCb = () => any;

const initialState: PersistorState = {
  registry: [],
  bootstrapped: false,
}

const persistorReducer = (state = initialState, action: AnyAction) => {
  const firstIndex = state.registry.indexOf(action.key)
  const registry = [...state.registry]
  switch (action.type) {
    case REGISTER:
      return { ...state, registry: [...state.registry, action.key] }
    case REHYDRATE:
      // a key can rehydrate again after a timeout; it's no longer registered then
      if (firstIndex !== -1) registry.splice(firstIndex, 1)
      return { ...state, registry, bootstrapped: registry.length === 0 }
    default:
      return state
  }
}

// Error instances aren't serializable, so REHYDRATE carries a plain copy
const serializeError = (err: any) =>
  err instanceof Error ? { name: err.name, message: err.message } : err

interface OptionToTestObject {
  [key: string]: any;
}

export default function persistStore(
  store: Store,
  options?: PersistorOptions | null,
  cb?: BoostrappedCb
): Persistor {
  // help catch incorrect usage of passing PersistConfig in as PersistorOptions
  if (process.env.NODE_ENV !== 'production') {
    const optionsToTest: OptionToTestObject = options || {}
    const bannedKeys = [
      'allowlist',
      'denylist',
      'blacklist',
      'whitelist',
      'transforms',
      'storage',
      'keyPrefix',
      'migrate',
    ]
    bannedKeys.forEach(k => {
      if (optionsToTest[k])
        console.error(
          `redux-persist: invalid option passed to persistStore: "${k}". You may be incorrectly passing persistConfig into persistStore, whereas it should be passed into persistReducer.`
        )
    })
  }
  let boostrappedCb = cb || false

  const _pStore = createStore(
    persistorReducer,
    initialState,
    options && options.enhancer ? options.enhancer : undefined
  )
  const register = (key: string) => {
    _pStore.dispatch({
      type: REGISTER,
      key,
    })
  }

  const rehydrate = (key: string, payload: Record<string, unknown>, err: any) => {
    const rehydrateAction = {
      type: REHYDRATE,
      payload,
      err: serializeError(err),
      key,
    }
    // dispatch to `store` to rehydrate and `persistor` to track result
    store.dispatch(rehydrateAction)
    _pStore.dispatch(rehydrateAction)
    if (typeof boostrappedCb === "function" && persistor.getState().bootstrapped) {
      boostrappedCb()
      boostrappedCb = false
    }
  }

  const persistor: Persistor = {
    ..._pStore,
    purge: () => {
      const results: Array<any> = []
      store.dispatch(
        attachHandle({ type: PURGE }, { result: purgeResult => results.push(purgeResult) })
      )
      return Promise.all(results)
    },
    flush: () => {
      const results: Array<any> = []
      store.dispatch(
        attachHandle({ type: FLUSH }, { result: flushResult => results.push(flushResult) })
      )
      return Promise.all(results)
    },
    pause: () => {
      store.dispatch({
        type: PAUSE,
      })
    },
    persist: () => {
      store.dispatch(attachHandle({ type: PERSIST }, { register, rehydrate }))
    },
  }

  if (!(options && options.manualPersist)){
    persistor.persist()
  }

  return persistor
}
