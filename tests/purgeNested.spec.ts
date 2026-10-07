/* eslint-disable @typescript-eslint/no-explicit-any */
// After persistor.purge(), a persistReducer ignores REHYDRATE for its own key,
// so purged data doesn't come back. It must still pass REHYDRATE for other
// keys through to the nested persistReducers that need it.
import test from 'ava'
import { combineReducers, legacy_createStore as createStore } from 'redux'

import { persistReducer, persistStore } from '../src'
import type { PersistConfig } from '../src'
import sleep from './utils/sleep'

const createStorage = (delays: Record<string, number> = {}) => {
  const data: Record<string, string> = {}
  return {
    data,
    getItem: (key: string) =>
      new Promise<string | undefined>(resolve => setTimeout(() => resolve(data[key]), delays[key] || 0)),
    setItem: (key: string, value: string) => { data[key] = value; return Promise.resolve() },
    removeItem: (key: string) => { delete data[key]; return Promise.resolve() },
  }
}
const stored = (storage: ReturnType<typeof createStorage>, key: string, field: string) =>
  JSON.parse(JSON.parse(storage.data[key])[field])

const items = (state: any = { items: [] }, action: any) =>
  action.type === 'add' ? { ...state, items: [...state.items, action.item] } : state

test('a nested persistReducer keeps saving when a purge lands before its read finishes', async t => {
  const storage = createStorage({ 'persist:auth': 30 })
  const store = createStore(
    persistReducer(
      { key: 'root', storage, denylist: ['auth'] },
      combineReducers({ auth: persistReducer({ key: 'auth', storage }, items), other: items })
    )
  )
  const persistor = persistStore(store)
  await sleep(5)
  // the root has loaded, auth's read is still in flight: log out right away
  await persistor.purge()
  await sleep(40)

  t.true(store.getState().auth._persist.rehydrated)
  t.true(persistor.getState().bootstrapped)
  store.dispatch({ type: 'add', item: 'after purge' })
  await persistor.flush()
  t.deepEqual(stored(storage, 'persist:auth', 'items'), ['after purge'])
})

test('a persistReducer added after a purge still loads its stored state', async t => {
  const storage = createStorage()
  storage.data['persist:notifications'] = JSON.stringify({
    items: JSON.stringify(['stored']),
    _persist: JSON.stringify({ version: -1, rehydrated: true }),
  })
  // shared by the root reducer before and after notifications is added
  const rootConfig: PersistConfig<any> = { key: 'root', storage, denylist: ['notifications'] }
  const store = createStore(persistReducer(rootConfig, combineReducers({ other: items })))
  const persistor = persistStore(store)
  await sleep(10)
  await persistor.purge()

  // code splitting: a persisted reducer is added later
  store.replaceReducer(
    persistReducer(
      rootConfig,
      combineReducers({ other: items, notifications: persistReducer({ key: 'notifications', storage }, items) })
    ) as any
  )
  persistor.persist()
  await sleep(10)

  t.deepEqual((store.getState() as any).notifications.items, ['stored'])
  store.dispatch({ type: 'add', item: 'new' })
  await persistor.flush()
  t.deepEqual(stored(storage, 'persist:notifications', 'items'), ['stored', 'new'])
})
