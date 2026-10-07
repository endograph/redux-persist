/* eslint-disable @typescript-eslint/no-explicit-any */
// #1387: Redux DevTools recomputes state by replaying the original action
// objects, after replaceReducer (hot reloading, injected reducers) or when an
// action is toggled. A replay must rebuild the same state without reading or
// purging storage again.
import test from 'ava'
import { combineReducers } from 'redux'
import type { Reducer } from 'redux'

import { createMigrate, persistReducer, persistStore } from '../src'
import sleep from './utils/sleep'

// Like @redux-devtools/instrument: keeps every dispatched action, and
// recomputes state from scratch by replaying the same action objects.
function createDevtoolsStore(reducer: Reducer<any, any>) {
  let current = reducer
  const actions: any[] = []
  const recompute = () =>
    actions.reduce((state, action) => current(state, action), current(undefined, { type: '@@INIT' }))
  let state = recompute()
  return {
    getState: () => state,
    dispatch: (action: any) => {
      actions.push(action)
      state = current(state, action)
      return action
    },
    subscribe: () => () => {},
    replaceReducer: (next: Reducer<any, any>) => {
      current = next
      state = recompute()
    },
    // a full recompute with the same reducer (toggling an action recomputes
    // from that action on, which is the same for actions after it)
    recompute: () => {
      state = recompute()
    },
  }
}

const PERSIST_STATE = { version: -1, rehydrated: true }
const createStorage = (stored?: Record<string, Record<string, any>>) => {
  const data: Record<string, string> = {}
  for (const [key, value] of Object.entries(stored || {})) {
    const serialized: Record<string, string> = {}
    for (const [k, v] of Object.entries(value)) serialized[k] = JSON.stringify(v)
    data[key] = JSON.stringify(serialized)
  }
  const calls = { getItem: 0, removeItem: 0 }
  return {
    data,
    calls,
    getItem: (key: string) => {
      calls.getItem++
      return Promise.resolve(data[key])
    },
    setItem: (key: string, value: string) => {
      data[key] = value
      return Promise.resolve()
    },
    removeItem: (key: string) => {
      calls.removeItem++
      delete data[key]
      return Promise.resolve()
    },
  }
}
const storedValue = (storage: ReturnType<typeof createStorage>, key: string, field: string) =>
  JSON.parse(JSON.parse(storage.data[key])[field])

const reducer = (state: any = { lastAccess: null }, action: any) =>
  action.type === 'visit' ? { ...state, lastAccess: action.at } : state

test('a replay after replaceReducer keeps newer state and does not read storage again', async t => {
  const storage = createStorage({ 'persist:root': { lastAccess: 'old', _persist: PERSIST_STATE } })
  const config = { key: 'root', storage }
  const store = createDevtoolsStore(persistReducer(config, reducer))
  const persistor = persistStore(store as any)
  await sleep(10)
  t.is(store.getState().lastAccess, 'old')

  // a change, then a reducer injected in the same tick (hot reloading
  // replaces the reducer the same way)
  store.dispatch({ type: 'visit', at: 'new' })
  store.replaceReducer(persistReducer(config, reducer))
  await sleep(10)

  t.is(store.getState().lastAccess, 'new')
  t.true(store.getState()._persist.rehydrated)
  t.is(storedValue(storage, 'persist:root', 'lastAccess'), 'new')
  t.is(storage.calls.getItem, 1)
  t.true(persistor.getState().bootstrapped)

  // and it keeps saving
  store.dispatch({ type: 'visit', at: 'later' })
  await persistor.flush()
  t.is(storedValue(storage, 'persist:root', 'lastAccess'), 'later')
})

test('a replay does not purge storage again', async t => {
  const storage = createStorage()
  const config = { key: 'root', storage }
  const store = createDevtoolsStore(persistReducer(config, reducer))
  const persistor = persistStore(store as any)
  await sleep(10)
  await persistor.purge()
  store.dispatch({ type: 'visit', at: 'after purge' })
  await persistor.flush()

  store.replaceReducer(persistReducer(config, reducer))
  t.is(storage.calls.removeItem, 1)
  await sleep(10)
  t.is(storedValue(storage, 'persist:root', 'lastAccess'), 'after purge')
})

test('a replay keeps state that was rehydrated before a purge', async t => {
  const storage = createStorage({ 'persist:root': { lastAccess: 'old', _persist: PERSIST_STATE } })
  const config = { key: 'root', storage }
  const store = createDevtoolsStore(persistReducer(config, reducer))
  const persistor = persistStore(store as any)
  await sleep(10)
  await persistor.purge()

  store.replaceReducer(persistReducer(config, reducer))
  t.is(store.getState().lastAccess, 'old')
  t.true(store.getState()._persist.rehydrated)
})

test('a replay does not read nested persisted reducers again', async t => {
  const storage = createStorage({
    'persist:root': { other: { lastAccess: 'root' }, _persist: PERSIST_STATE },
    'persist:auth': { lastAccess: 'auth', _persist: PERSIST_STATE },
  })
  const createReducer = () =>
    persistReducer(
      { key: 'root', storage, denylist: ['auth'] },
      combineReducers({ auth: persistReducer({ key: 'auth', storage }, reducer), other: reducer })
    )
  const store = createDevtoolsStore(createReducer())
  persistStore(store as any)
  await sleep(10)
  t.is(storage.calls.getItem, 2)

  store.dispatch({ type: 'visit', at: 'new' })
  store.replaceReducer(createReducer())
  await sleep(10)
  t.is(storage.calls.getItem, 2)
  t.is(store.getState().auth.lastAccess, 'new')
  t.is(store.getState().other.lastAccess, 'new')
  t.is(storedValue(storage, 'persist:auth', 'lastAccess'), 'new')
})

test.serial('recomputing does not warn that _persist was lost, with actions from before PERSIST', async t => {
  const errors: any[] = []
  const original = console.error
  console.error = (...args: any[]) => { errors.push(args) }
  try {
    const storage = createStorage()
    const store = createDevtoolsStore(persistReducer({ key: 'root', storage }, reducer))
    const persistor = persistStore(store as any, { manualPersist: true })
    // replayed without _persist, since PERSIST comes after it
    store.dispatch({ type: 'visit', at: 'before persist' })
    persistor.persist()
    await sleep(10)
    store.dispatch({ type: 'visit', at: 'new' })
    store.recompute()
    store.replaceReducer(persistReducer({ key: 'root', storage }, reducer))
    await sleep(10)
    t.is(store.getState().lastAccess, 'new')
    t.is(storage.calls.getItem, 1)
  } finally {
    console.error = original
  }
  t.deepEqual(errors, [])
})

test('a replay after pause and purge does not write the purged state back', async t => {
  const storage = createStorage({ 'persist:root': { lastAccess: 'old', _persist: PERSIST_STATE } })
  const config = { key: 'root', storage }
  const store = createDevtoolsStore(persistReducer(config, reducer))
  const persistor = persistStore(store as any)
  await sleep(10)
  // resume once, so the history has a second PERSIST
  persistor.pause()
  persistor.persist()
  // logging out: stop saving, write what's pending, then clear storage
  persistor.pause()
  await persistor.flush()
  await persistor.purge()

  store.replaceReducer(persistReducer(config, reducer))
  await sleep(10)
  t.false('persist:root' in storage.data)
  t.is(storage.calls.removeItem, 1)
})

test('a replay keeps saving when the history paused and then resumed', async t => {
  const storage = createStorage({ 'persist:root': { lastAccess: 'old', _persist: PERSIST_STATE } })
  const config = { key: 'root', storage }
  const store = createDevtoolsStore(persistReducer(config, reducer))
  const persistor = persistStore(store as any)
  await sleep(10)
  persistor.pause()
  persistor.persist()

  store.replaceReducer(persistReducer(config, reducer))
  store.dispatch({ type: 'visit', at: 'after replay' })
  await persistor.flush()
  t.is(storedValue(storage, 'persist:root', 'lastAccess'), 'after replay')
})

test('a replay keeps the version state was stored with when the new reducer has a newer one', async t => {
  const storage = createStorage({ 'persist:root': { lastAccess: 'old', _persist: { version: 1, rehydrated: true } } })
  const store = createDevtoolsStore(persistReducer({ key: 'root', storage, version: 1 }, reducer))
  const persistor = persistStore(store as any)
  await sleep(10)

  // hot reloading a version bump: the migration runs on the next launch
  const migrate = createMigrate({ 2: (state: any) => ({ ...state, lastAccess: 'migrated' }) })
  store.replaceReducer(persistReducer({ key: 'root', storage, version: 2, migrate }, reducer))
  store.dispatch({ type: 'visit', at: 'new' })
  await persistor.flush()
  t.is(storedValue(storage, 'persist:root', 'lastAccess'), 'new')
  t.is(store.getState()._persist.version, 1)
  t.is(storedValue(storage, 'persist:root', '_persist').version, 1)
})

test('a replay does not read a persistReducer added without replaceReducer again', async t => {
  const storage = createStorage({ 'persist:notes': { items: ['stored'], _persist: PERSIST_STATE } })
  const items = (state: any = { items: [] }, action: any) =>
    action.type === 'add' ? { ...state, items: [...state.items, action.item] } : state
  // a reducer map that grows in place, like RTK's combineSlices().inject()
  const reducers: Record<string, Reducer<any, any>> = { other: items }
  const root = (state: any = {}, action: any) => {
    const next: any = {}
    for (const key of Object.keys(reducers)) next[key] = reducers[key](state[key], action)
    return next
  }
  const store = createDevtoolsStore(persistReducer({ key: 'root', storage, denylist: ['notes'] }, root))
  const persistor = persistStore(store as any)
  await sleep(10)
  reducers.notes = persistReducer({ key: 'notes', storage }, items)
  persistor.persist()
  await sleep(10)
  store.dispatch({ type: 'add', item: 'new' })
  await persistor.flush()
  const reads = storage.calls.getItem

  store.recompute()
  await sleep(10)
  t.deepEqual(store.getState().notes.items, ['stored', 'new'])
  t.is(storage.calls.getItem, reads)
  t.deepEqual(storedValue(storage, 'persist:notes', 'items'), ['stored', 'new'])
})

test.serial('two persistReducers with the same key both read and purge, with a warning', async t => {
  const errors: string[] = []
  const original = console.error
  console.error = (...args: any[]) => { errors.push(String(args[0])) }
  try {
    const storage = createStorage({
      'a:settings': { lastAccess: 'a', _persist: PERSIST_STATE },
      'b:settings': { lastAccess: 'b', _persist: PERSIST_STATE },
    })
    const store = createDevtoolsStore(combineReducers({
      a: persistReducer({ key: 'settings', keyPrefix: 'a:', storage }, reducer),
      b: persistReducer({ key: 'settings', keyPrefix: 'b:', storage }, reducer),
    }))
    const persistor = persistStore(store as any)
    await sleep(10)
    t.is(storage.calls.getItem, 2)
    await persistor.purge()
    t.false('a:settings' in storage.data)
    t.false('b:settings' in storage.data)
  } finally {
    console.error = original
  }
  t.true(errors.some(e => e.includes('more than one persistReducer uses the key "settings"')))
})
