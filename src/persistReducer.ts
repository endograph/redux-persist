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
  KEY_PREFIX,
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
import type { PersistorHandle } from './persistorHandle.js'
import defaultGetStoredState from './getStoredState.js'
import purgeStoredState from './purgeStoredState.js'

// Persistence state for each store using a persistReducer. A persisted reducer
// is usually created once and shared by every store built from it (a store per
// server request or per test), so this state can't live in its closure. It's
// keyed by the store's _persist object, which only persistReducer creates and
// which isn't stored (the stored _persist is written from its fields).
interface PersistedStore {
  owner: object
  // where the owner saves this store's state (keyPrefix + key)
  storageKey: string
  persistoid: Persistoid | null
  // purged: REHYDRATE no longer changes state
  purged: boolean
  paused: boolean
  // The stored state couldn't be read (storage error, unparseable data,
  // failed migration or timeout). Writing then would replace the user's
  // stored data with initial state (#809), so writes stay off until the
  // stored state is read or purged.
  readFailed: boolean
  // the version it was persisted with, which a devtools replay keeps
  version: number
}
const stores = new WeakMap<object, PersistedStore>()
const storeFor = (persist: unknown): PersistedStore | undefined =>
  persist && typeof persist === 'object' ? stores.get(persist) : undefined
const trackStore = <T extends object>(persist: T, store: PersistedStore): T => {
  stores.set(persist, store)
  return persist
}

// Redux DevTools recomputes state by replaying the original action objects,
// handles included: after replaceReducer (hot reloading, injected reducers) or
// when an action is toggled. A replay must not read or purge storage again
// (#1387). Each persist key records the PERSIST, PURGE and FLUSH handles it
// acted on, with the store it acted for; a handle that reaches persistReducer
// after its dispatch returned, having reached it before, is being replayed.
const handleUses = new WeakMap<PersistorHandle, Map<string, PersistedStore | undefined>>()
const usesOf = (handle: PersistorHandle) => {
  let uses = handleUses.get(handle)
  if (!uses) handleUses.set(handle, (uses = new Map()))
  return uses
}
// (a handle that never reached a persistReducer, delayed by a middleware for
// example, is still acted on)
const isReplay = (handle: PersistorHandle) => !!handle.dispatched && usesOf(handle).size > 0
// REHYDRATE actions that were applied, so a replay applies them again even if
// the store has been purged since
const appliedRehydrates = new WeakSet<object>()

const isObject = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

// Adds _persist to the state the reducer returned. Redux Toolkit (immer)
// freezes the state it produces, so keep the new top level frozen too (#1298).
const withPersist = (state: any, _persist: any) => {
  const result = { ...state, _persist }
  return state !== null && typeof state === 'object' && Object.isFrozen(state) ? Object.freeze(result) : result
}

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
  const storageKey = `${
    config.keyPrefix !== undefined ? config.keyPrefix : KEY_PREFIX
  }${config.key}`
  const timeout =
    config.timeout !== undefined ? config.timeout : DEFAULT_TIMEOUT
  // identifies this persistReducer instance (see adoptStore)
  const owner = {}
  let warnedNonObjectState = false
  // development warning for state that lost its _persist key (#659). It waits
  // a tick and is dropped if _persist comes back: a devtools recompute replays
  // the actions from before PERSIST, which have no _persist either.
  let startedPersisting = false
  let warnedLostPersist = false
  let lostPersistTimer: ReturnType<typeof setTimeout> | null = null
  const cancelLostPersistWarning = () => {
    if (lostPersistTimer) {
      clearTimeout(lostPersistTimer)
      lostPersistTimer = null
    }
  }
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
      // Replacing the reducer keeps the state, so a new key gets the current
      // state written over what's stored there (#1112).
      if (process.env.NODE_ENV !== 'production' && store.storageKey !== storageKey)
        console.error(
          `redux-persist: persistReducer was replaced by one that saves to "${storageKey}" instead of "${store.storageKey}". The current state will be saved there, replacing what is stored under that key (replacing the reducer doesn't load it). To switch to another stored state, for example another user's, create a new store and persistor instead.`
        )
      store.owner = owner
      store.storageKey = storageKey
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
    if (_persist) cancelLostPersistWarning()
    // undefined when this store hasn't been persisted (including state
    // preloaded from elsewhere, e.g. server rendering, that has a _persist key)
    const store = adoptStore(storeFor(_persist))

    if (action.type === PERSIST) {
      // persistReducer adds a `_persist` key, so it needs object state; an
      // array or primitive would be spread into a plain object (#215)
      if (
        process.env.NODE_ENV !== 'production' &&
        !warnedNonObjectState &&
        (state === null || Array.isArray(state) || (state !== undefined && typeof state !== 'object'))
      ) {
        warnedNonObjectState = true
        console.error(
          `redux-persist: persistReducer for "${config.key}" needs its reducer's state to be a plain object, but it is ${
            Array.isArray(state) ? 'an array' : state === null ? 'null' : `a ${typeof state}`
          }. It would be turned into an object. Wrap it in an object (for example { items: [] }) or persist the parent reducer instead.`
        )
      }
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
      const uses = usesOf(handle)
      const used = uses.get(config.key)
      cancelLostPersistWarning()
      if (isReplay(handle)) {
        // A devtools replay: rebuild the state this PERSIST produced, without
        // registering, reading storage or resuming writes. The store's flags
        // (paused, purged) keep their current values.
        if (store) return withPersist(baseReducer(restState, action), _persist)
        // this persistReducer was added after the original PERSIST (without
        // replaceReducer), so it isn't started by this one
        if (!used) return _persist ? state : baseReducer(state, action)
        // the PERSIST that created this store: the replayed REHYDRATE that
        // follows restores what was read
        adoptStore(used)
        startedPersisting = true
        return withPersist(
          baseReducer(restState, action),
          trackStore({ version: used.version, rehydrated: false }, used)
        )
      }
      if (!store && used && process.env.NODE_ENV !== 'production')
        console.error(
          `redux-persist: more than one persistReducer uses the key "${config.key}". Give each its own key.`
        )
      // a repeat PERSIST for this store reuses its state; otherwise start fresh
      const persisted: PersistedStore = store || {
        owner,
        storageKey,
        persistoid: null,
        purged: false,
        paused: true,
        readFailed: false,
        version,
      }
      uses.set(config.key, persisted)
      let _sealed = false
      let _timedOut = false
      let timer: ReturnType<typeof setTimeout> | undefined
      // Dispatches REHYDRATE. If a reducer throws while handling it, the stored
      // state wasn't applied: keep writes off so it isn't overwritten, and
      // report the error instead of letting it escape the storage promise (#719).
      const dispatchRehydrate = (payload: any, err?: Error) => {
        try {
          // a read that finishes after the store was purged brings nothing back
          rehydrate(config.key, persisted.purged ? undefined : payload, err)
        } catch (reducerError) {
          persisted.readFailed = true
          if (process.env.NODE_ENV !== 'production')
            console.error(
              `redux-persist: a reducer threw while handling REHYDRATE for "${config.key}". The stored state was not applied, and writes are paused so it isn't overwritten.`,
              reducerError
            )
        }
      }
      const _rehydrate = (payload: any, err?: Error) => {
        if (_sealed) {
          // The read finished after the timeout: apply the stored state now
          // and resume writing. If it failed, writes stay off.
          if (_timedOut && !err) {
            persisted.readFailed = false
            dispatchRehydrate(payload)
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

        // seal first, so a throwing reducer can't leave the timeout armed
        _sealed = true
        clearTimeout(timer)
        dispatchRehydrate(payload, err)
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
        return conditionalUpdate(withPersist(baseReducer(restState, action), _persist))
      }

      register(config.key)
      startedPersisting = true

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

      return withPersist(
        baseReducer(restState, action),
        trackStore({ version, rehydrated: false }, persisted)
      )
    } else if (action.type === PURGE) {
      const handle = getHandle(action)
      // not again when devtools replays the PURGE
      if (handle && handle.result && !isReplay(handle)) {
        usesOf(handle).set(config.key, store)
        if (store) {
          store.purged = true
          // stored data is gone, so there is nothing left to protect
          store.readFailed = false
        }
        // purge storage even if this store hasn't started persisting yet
        handle.result(purgeStoredState(config))
      }
      return withPersist(baseReducer(restState, action), _persist)
    } else if (action.type === FLUSH) {
      const handle = getHandle(action)
      if (handle && handle.result && !isReplay(handle)) {
        usesOf(handle).set(config.key, store)
        handle.result(store && store.persistoid && store.persistoid.flush())
      }
      return withPersist(baseReducer(restState, action), _persist)
    } else if (action.type === PAUSE) {
      // a devtools replay of persistor.pause() leaves the store as it is now
      const handle = getHandle(action)
      if (store && !(handle && isReplay(handle))) {
        if (handle) usesOf(handle).set(config.key, store)
        store.paused = true
      }
    } else if (action.type === REHYDRATE && store && action.key === config.key) {
      // A REHYDRATE for another key (a nested persistReducer's) continues to
      // the default passthrough below, even when this store has been purged.

      // noop on restState if purging, unless devtools is replaying a REHYDRATE
      // that was applied before the purge
      if (store.purged && !appliedRehydrates.has(action))
        return {
          ...restState,
          _persist: trackStore({ ..._persist, rehydrated: true }, store),
        }

      const reducedState = baseReducer(restState, action)
      const inboundState = action.payload
      // only reconcile state if stateReconciler and inboundState are both defined
      const reconciledRest: S =
        stateReconciler !== false && inboundState !== undefined
          ? keepNestedPersist(stateReconciler(inboundState, state, reducedState, config), reducedState)
          : reducedState

      const newState = withPersist(
        reconciledRest,
        trackStore({ ..._persist, rehydrated: true }, store)
      )
      appliedRehydrates.add(action)
      return conditionalUpdate(newState)
    }

    // if we have not already handled PERSIST, straight passthrough
    if (!_persist) {
      // State that this reducer persisted came back without _persist, so
      // persistence can no longer tell which store it belongs to and stops
      // saving it. Usually it was reset above persistReducer, e.g. on logout
      // (#659). Redux's own actions are skipped: a new store starts this way.
      if (
        process.env.NODE_ENV !== 'production' &&
        startedPersisting &&
        !warnedLostPersist &&
        !lostPersistTimer &&
        !(typeof action.type === 'string' && action.type.startsWith('@@redux/'))
      ) {
        lostPersistTimer = setTimeout(() => {
          lostPersistTimer = null
          warnedLostPersist = true
          console.error(
            `redux-persist: state for "${config.key}" lost its _persist key, so it is no longer being saved and the previously stored state will be loaded on the next launch. This usually means the state was reset above persistReducer (for example on logout). Reset it inside the reducer you pass to persistReducer instead: https://github.com/endograph/redux-persist#resetting-state-on-logout`
          )
        }, 0)
      }
      return baseReducer(state, action)
    }

    // run base reducer:
    // is state modified ? return original : return updated
    const newState = baseReducer(restState, action)
    if (newState === restState) return state
    // A nested persistReducer's REHYDRATE passing through a purged store
    // doesn't save it, which would write back what was purged; the next real
    // change saves as usual.
    if (action.type === REHYDRATE && store && store.purged) return withPersist(newState, _persist)
    return conditionalUpdate(withPersist(newState, _persist))
  }
}
