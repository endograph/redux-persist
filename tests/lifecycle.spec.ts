/* eslint-disable @typescript-eslint/no-explicit-any */
// Lifecycle edge cases from review: nested persists whose parent also stores
// the child, reducer replacement with pending writes, purge before persist.
import test from 'ava'
import { combineReducers, legacy_createStore as createStore } from 'redux'

import { persistReducer, persistStore } from '../src'
import sleep from './utils/sleep'

const persisted = (fields: Record<string, unknown>, version = -1) =>
  JSON.stringify({
    ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, JSON.stringify(v)])),
    _persist: JSON.stringify({ version, rehydrated: true }),
  })

// getItem resolves in the given order, so tests control which reducer loads last
const createStorage = (initial: Record<string, string>, readDelays: Record<string, number> = {}) => {
  const data: Record<string, any> = { ...initial }
  return {
    data,
    getItem: (key: string) => sleep(readDelays[key] || 0).then(() => data[key]),
    setItem: (key: string, value: any) => { data[key] = value; return Promise.resolve() },
    removeItem: (key: string) => { delete data[key]; return Promise.resolve() },
  }
}

const childValue = (raw: string) => JSON.parse(JSON.parse(raw).value)

const counter = (state: any = { value: 0 }, action: any) =>
  action.type === 'SET_CHILD' ? { ...state, value: action.value } : state

const nestedStore = (storage: any) =>
  createStore(
    persistReducer(
      { key: 'parent', storage },
      combineReducers({ child: persistReducer({ key: 'child', storage }, counter) })
    )
  )

const bootstrap = (store: any) =>
  new Promise<any>(resolve => {
    const persistor = persistStore(store, null, () => resolve(persistor))
  })

// The parent also stores the child (no denylist), with an older child value.
const parentData = JSON.stringify({
  child: JSON.stringify({ value: 3, _persist: { version: -1, rehydrated: true } }),
  _persist: JSON.stringify({ version: -1, rehydrated: true }),
})

test('nested persist: child loading after the parent keeps its stored value and keeps saving', async t => {
  const storage = createStorage({ 'persist:parent': parentData, 'persist:child': persisted({ value: 9 }) }, { 'persist:child': 30 })
  const store = nestedStore(storage)
  const persistor = await bootstrap(store)
  t.is(store.getState().child.value, 9)

  store.dispatch({ type: 'SET_CHILD', value: 10 })
  await persistor.flush()
  t.is(childValue(storage.data['persist:child']), 10)
})

test('nested persist: child keeps saving when the parent loads after it', async t => {
  const storage = createStorage({ 'persist:parent': parentData, 'persist:child': persisted({ value: 9 }) }, { 'persist:parent': 30 })
  const store = nestedStore(storage)
  const persistor = await bootstrap(store)

  store.dispatch({ type: 'SET_CHILD', value: 10 })
  await persistor.flush()
  t.is(store.getState().child.value, 10)
  t.is(childValue(storage.data['persist:child']), 10)
})

test('replacing the reducer does not let an older pending write overwrite newer data', async t => {
  const storage = createStorage({})
  const config = { key: 'root', storage, throttle: 100 }
  const reducer = (state: any = { value: 0 }, action: any) => (action.type === 'SET' ? { value: action.value } : state)
  const store = createStore(persistReducer(config, reducer))
  const persistor = await bootstrap(store)

  store.dispatch({ type: 'SET', value: 1 }) // queued behind the 100ms throttle
  store.replaceReducer(persistReducer(config, reducer))
  store.dispatch({ type: 'SET', value: 2 })
  await persistor.flush()
  t.is(JSON.parse(JSON.parse(storage.data['persist:root']).value), 2)

  await sleep(150) // past the original throttle
  t.is(JSON.parse(JSON.parse(storage.data['persist:root']).value), 2)
})

test('purge() before persist() removes stored data (manualPersist)', async t => {
  const storage = createStorage({ 'persist:root': persisted({ value: 42 }) })
  const reducer = (state: any = { value: 0 }) => state
  const store = createStore(persistReducer({ key: 'root', storage }, reducer))
  const persistor = persistStore(store, { manualPersist: true })
  await persistor.purge()
  t.is(storage.data['persist:root'], undefined)

  persistor.persist()
  await sleep(20)
  t.is(store.getState().value, 0)
})

test('nested persist two levels deep keeps saving after the parent rehydrates', async t => {
  const storage = createStorage({
    'persist:parent': JSON.stringify({
      area: JSON.stringify({ child: { value: 3, _persist: { version: -1, rehydrated: true } } }),
      _persist: JSON.stringify({ version: -1, rehydrated: true }),
    }),
    'persist:child': persisted({ value: 9 }),
  }, { 'persist:parent': 30 })
  const store = createStore(
    persistReducer(
      { key: 'parent', storage },
      combineReducers({ area: combineReducers({ child: persistReducer({ key: 'child', storage }, counter) }) })
    )
  )
  const persistor = await bootstrap(store)
  store.dispatch({ type: 'SET_CHILD', value: 11 })
  await persistor.flush()
  t.is(childValue(storage.data['persist:child']), 11)
})
