/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Action, Reducer, UnknownAction } from 'redux'

import {
  FLUSH,
  PAUSE,
  PERSIST,
  PURGE,
  REHYDRATE,
  DEFAULT_VERSION,
  DEFAULT_TIMEOUT,
} from './constants.js'

import type {
  PersistConfig,
  PersistPartial,
  Persistoid,
  StateReconciler,
} from './types.js'

import autoMergeLevel1 from './stateReconciler/autoMergeLevel1.js'
import createPersistoid from './createPersistoid.js'
import { getHandle } from './persistorHandle.js'
import defaultGetStoredState from './getStoredState.js'
import purgeStoredState from './purgeStoredState.js'

// Persistence state for each store using a persistReducer. A persisted reducer
// is usually created once and shared by every store built from it (a store per
// server request or per test), so this state can't live in its closure. It's
// keyed by the store's _persist object, which only persistReducer creates and
// which isn't stored (the stored _persist is written from its fields).
interface PersistedStore {
  owner: object
  persistoid: Persistoid | null
  // purged: REHYDRATE no longer changes state
  purged: boolean
  paused: boolean
  // The stored state couldn't be read (storage error, unparseable data,
  // failed migration or timeout). Writing then would replace the user's
  // stored data with initial state (#809), so writes stay off until the
  // stored state is read or purged.
  readFailed: boolean
}
const stores = new WeakMap<object, PersistedStore>()
const storeFor = (persist: unknown): PersistedStore | undefined =>
  persist && typeof persist === 'object' ? stores.get(persist) : undefined
const trackStore = <T extends object>(persist: T, store: PersistedStore): T => {
  stores.set(persist, store)
  return persist
}

const isObject = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

// When a parent persistReducer also stores a nested persisted reducer's
// state, rehydrating the parent restores a deserialized copy of the child's
// _persist. Put the child's live _persist back, so the child is still
// recognized as the same store (and keeps its own version and status).
function keepNestedPersist(reconciled: any, current: any): any {
  if (!isObject(reconciled) || !isObject(current) || reconciled === current) return reconciled
  let result = reconciled
  for (const key of Object.keys(current)) {
    const live = current[key]
    const next = reconciled[key]
    if (key === '_persist' || !isObject(live) || !isObject(next) || next === live) continue
    let fixed = keepNestedPersist(next, live)
    if (storeFor(live._persist) && fixed._persist !== live._persist)
      fixed = { ...fixed, _persist: live._persist }
    if (fixed !== next) {
      if (result === reconciled) result = { ...reconciled }
      result[key] = fixed
    }
  }
  return result
}

/*
  @TODO add validation / handling for:
  - persisting a reducer which has nested _persist
  - handling actions that fire before reydrate is called
*/
// Blocks inference from the config, so the state type comes from the reducer
// alone: a generic reconciler like `stateReconciler: hardSet` would otherwise
// pull it to unknown (#1368). Works on TypeScript versions before NoInfer.
type FromReducerOnly<T> = [T][T extends any ? 0 : never]

export default function persistReducer<S, A extends Action = UnknownAction, P = S>(
  config: PersistConfig<FromReducerOnly<S>>,
  baseReducer: Reducer<S, A, P>
): Reducer<S & PersistPartial, A, P & Partial<PersistPartial>> {
  if (process.env.NODE_ENV !== 'production') {
    if (!config) throw new Error('config is required for persistReducer')
    if (!config.key) throw new Error('key is required in persistor config')
    if (!config.storage)
      throw new Error(
        "redux-persist: config.storage is required. Try using one of the provided storage engines `import storage from 'redux-persist/lib/storage'`"
      )
  }

  const version =
    config.version !== undefined ? config.version : DEFAULT_VERSION
  const stateReconciler: false | StateReconciler<S> =
    config.stateReconciler === undefined
      ? autoMergeLevel1
      : config.stateReconciler
  const getStoredState = config.getStoredState || defaultGetStoredState
  const timeout =
    config.timeout !== undefined ? config.timeout : DEFAULT_TIMEOUT
  // identifies this persistReducer instance (see adoptStore)
  const owner = {}
  const conditionalUpdate = (state: any) => {
    // update the persistoid only if we are rehydrated, not paused, and the
    // stored state was read
    const store = storeFor(state._persist)
    store &&
      state._persist.rehydrated &&
      store.persistoid &&
      !store.paused &&
      !store.readFailed &&
      store.persistoid.update(state)
    return state
  }
  // A store this instance hasn't seen (after replaceReducer with a new
  // persistReducer, e.g. hot reloading) keeps its state but gets a persistoid
  // built from this instance's config.
  const adoptStore = (store: PersistedStore | undefined) => {
    if (store && store.owner !== owner) {
      store.owner = owner
      if (store.persistoid) {
        // write what the previous writer had pending now, and cancel its
        // timer, so it can't overwrite newer state later
        const pending = store.persistoid.flush()
        store.persistoid = createPersistoid(config, pending)
      }
    }
    return store
  }

  return (state: any, action: any) => {
    const { _persist, ...rest } = state || {}
    const restState: S = rest
    // undefined when this store hasn't been persisted (including state
    // preloaded from elsewhere, e.g. server rendering, that has a _persist key)
    const store = adoptStore(storeFor(_persist))

    if (action.type === PERSIST) {
      const handle = getHandle(action)
      // A PERSIST without a handle wasn't dispatched by persistStore (for example a
      // devtools replay), so there is nobody to register with or rehydrate.
      if (!handle || !handle.register || !handle.rehydrate) {
        if (process.env.NODE_ENV !== 'production')
          console.warn(
            'redux-persist: ignoring a PERSIST action that was not dispatched by persistStore (for example a devtools replay). Use persistor.persist() to start persisting.'
          )
        return _persist ? state : baseReducer(state, action)
      }
      const { register, rehydrate } = handle
      // a repeat PERSIST for this store reuses its state; otherwise start fresh
      const persisted: PersistedStore = store || {
        owner,
        persistoid: null,
        purged: false,
        paused: true,
        readFailed: false,
      }
      let _sealed = false
      let _timedOut = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const _rehydrate = (payload: any, err?: Error) => {
        if (_sealed) {
          // The read finished after the timeout: apply the stored state now
          // and resume writing. If it failed, writes stay off.
          if (_timedOut && !err) {
            persisted.readFailed = false
            rehydrate(config.key, payload)
          }
          return
        }

        if (err) {
          persisted.readFailed = true
          if (process.env.NODE_ENV !== 'production')
            console.error(
              _timedOut
                ? `redux-persist: reading stored state for "${config.key}" timed out. Writes are paused until the read finishes, then the stored state is applied.`
                : `redux-persist: could not read stored state for "${config.key}". Writes are paused so the stored data isn't overwritten; call persistor.purge() to discard it.`,
              err
            )
        }

        rehydrate(config.key, payload, err)
        _sealed = true
        clearTimeout(timer)
      }
      if (timeout) {
        timer = setTimeout(() => {
          _timedOut = true
          !_sealed &&
            _rehydrate(
              undefined,
              new Error(
                `redux-persist: persist timed out for persist key "${
                  config.key
                }"`
              )
            )
        }, timeout)
      }

      // @NOTE PERSIST resumes if paused.
      persisted.paused = false

      // @NOTE only ever create persistoid once per store
      if (!persisted.persistoid) persisted.persistoid = createPersistoid(config)

      // @NOTE PERSIST can be called multiple times, noop after the first
      if (store) {
        // This PERSIST will not rehydrate, so cancel its timeout
        _sealed = true
        clearTimeout(timer)
        // We still need to call the base reducer because there might be nested
        // uses of persistReducer which need to be aware of the PERSIST action.
        // conditionalUpdate saves any changes made while paused.
        return conditionalUpdate({
          ...baseReducer(restState, action),
          _persist,
        })
      }

      register(config.key)

      getStoredState(config).then(
        restoredState => {
          if (restoredState) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const migrate = config.migrate || ((s, _) => Promise.resolve(s))
            migrate(restoredState as any, version).then(
              migratedState => {
                _rehydrate(migratedState)
              },
              migrateErr => {
                if (process.env.NODE_ENV !== 'production' && migrateErr)
                  console.error('redux-persist: migration error', migrateErr)
                _rehydrate(undefined, migrateErr)
              }
            )
          } else {
            _rehydrate(undefined)
          }
        },
        err => {
          _rehydrate(undefined, err)
        }
      )

      return {
        ...baseReducer(restState, action),
        _persist: trackStore({ version, rehydrated: false }, persisted),
      }
    } else if (action.type === PURGE) {
      const handle = getHandle(action)
      if (handle && handle.result) {
        if (store) {
          store.purged = true
          // stored data is gone, so there is nothing left to protect
          store.readFailed = false
        }
        // purge storage even if this store hasn't started persisting yet
        handle.result(purgeStoredState(config))
      }
      return {
        ...baseReducer(restState, action),
        _persist,
      }
    } else if (action.type === FLUSH) {
      const handle = getHandle(action)
      if (handle && handle.result) handle.result(store && store.persistoid && store.persistoid.flush())
      return {
        ...baseReducer(restState, action),
        _persist,
      }
    } else if (action.type === PAUSE) {
      if (store) store.paused = true
    } else if (action.type === REHYDRATE && store) {
      // noop on restState if purging
      if (store.purged)
        return {
          ...restState,
          _persist: trackStore({ ..._persist, rehydrated: true }, store),
        }

      // @NOTE if key does not match, will continue to default else below
      if (action.key === config.key) {
        const reducedState = baseReducer(restState, action)
        const inboundState = action.payload
        // only reconcile state if stateReconciler and inboundState are both defined
        const reconciledRest: S =
          stateReconciler !== false && inboundState !== undefined
            ? keepNestedPersist(stateReconciler(inboundState, state, reducedState, config), reducedState)
            : reducedState

        const newState = {
          ...reconciledRest,
          _persist: trackStore({ ..._persist, rehydrated: true }, store),
        }
        return conditionalUpdate(newState)
      }
    }

    // if we have not already handled PERSIST, straight passthrough
    if (!_persist) return baseReducer(state, action)

    // run base reducer:
    // is state modified ? return original : return updated
    const newState = baseReducer(restState, action)
    if (newState === restState) return state
    return conditionalUpdate({ ...newState, _persist })
  }
}
