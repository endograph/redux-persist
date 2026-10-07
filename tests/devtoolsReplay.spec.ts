/* eslint-disable @typescript-eslint/no-explicit-any */
// #1387: Redux DevTools recomputes state by replaying the original action
// objects, after replaceReducer (hot reloading, injected reducers) or when an
// action is toggled. A replay must rebuild the same state without reading or
// purging storage again.
import test from 'ava'
import { combineReducers } from 'redux'
import type { Reducer } from 'redux'

import { persistReducer, persistStore } from '../src'
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
    // what toggling an action does, with the same reducer
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

test.serial('recomputing with the same reducer does not warn that _persist was lost', async t => {
  const errors: any[] = []
  const original = console.error
  console.error = (...args: any[]) => { errors.push(args) }
  try {
    const storage = createStorage()
    const store = createDevtoolsStore(persistReducer({ key: 'root', storage }, reducer))
    persistStore(store as any)
    await sleep(10)
    store.dispatch({ type: 'visit', at: 'new' })
    store.recompute()
    await sleep(10)
    t.is(store.getState().lastAccess, 'new')
    t.is(storage.calls.getItem, 1)
  } finally {
    console.error = original
  }
  t.deepEqual(errors, [])
})
