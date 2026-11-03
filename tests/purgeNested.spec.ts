/* eslint-disable @typescript-eslint/no-explicit-any */
// After persistor.purge(), a persistReducer ignores REHYDRATE for its own key,
// so purged data doesn't come back. It must still pass REHYDRATE for other
// keys through to the nested persistReducers that need it.
import { expect, test } from 'vitest'
import { combineReducers, legacy_createStore as createStore } from 'redux'

import { persistReducer, persistStore, REHYDRATE } from '../src'
import type { PersistConfig } from '../src'
import sleep from './utils/sleep'

const createStorage = (delays: Record<string, number> = {}) => {
  const data: Record<string, string> = {}
  return {
    data,
    // reads what's stored when the read starts, and delivers it later
    getItem: (key: string) => {
      const value = data[key]
      return new Promise<string | undefined>(resolve => setTimeout(() => resolve(value), delays[key] || 0))
    },
    setItem: (key: string, value: string) => { data[key] = value; return Promise.resolve() },
    removeItem: (key: string) => { delete data[key]; return Promise.resolve() },
  }
}
const stored = (storage: ReturnType<typeof createStorage>, key: string, field: string) =>
  JSON.parse(JSON.parse(storage.data[key])[field])

const items = (state: any = { items: [] }, action: any) =>
  action.type === 'add' ? { ...state, items: [...state.items, action.item] } : state

test('a nested persistReducer keeps saving when a purge lands before its read finishes', async () => {
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

  expect(store.getState().auth._persist.rehydrated).toBe(true)
  expect(persistor.getState().bootstrapped).toBe(true)
  store.dispatch({ type: 'add', item: 'after purge' })
  await persistor.flush()
  expect(stored(storage, 'persist:auth', 'items')).toStrictEqual(['after purge'])
})

test('a persistReducer added after a purge still loads its stored state', async () => {
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

  expect((store.getState() as any).notifications.items).toStrictEqual(['stored'])
  store.dispatch({ type: 'add', item: 'new' })
  await persistor.flush()
  expect(stored(storage, 'persist:notifications', 'items')).toStrictEqual(['stored', 'new'])
})

test('a read that finishes after a purge does not bring the purged data back', async () => {
  const storage = createStorage({ 'persist:auth': 30 })
  const PERSIST_STATE = JSON.stringify({ version: -1, rehydrated: true })
  // the root also stores auth, as it does without a denylist
  storage.data['persist:root'] = JSON.stringify({
    auth: JSON.stringify({ items: ['secret'], _persist: { version: -1, rehydrated: true } }),
    _persist: PERSIST_STATE,
  })
  storage.data['persist:auth'] = JSON.stringify({ items: JSON.stringify(['secret']), _persist: PERSIST_STATE })
  // a plain reducer that also reads auth's REHYDRATE
  const lastAuth = (state: any = null, action: any) =>
    action.type === REHYDRATE && action.key === 'auth' && action.payload ? action.payload.items : state
  const store = createStore(
    persistReducer(
      { key: 'root', storage },
      combineReducers({ auth: persistReducer({ key: 'auth', storage }, items), lastAuth })
    )
  )
  const persistor = persistStore(store)
  await sleep(5)
  // log out while auth's read is in flight (writing what's pending first),
  // then the app reloads
  await persistor.flush()
  await persistor.purge()
  await sleep(40)

  expect(Object.keys(storage.data)).toStrictEqual([])
  expect((store.getState() as any).lastAuth).toBe(null)
  expect((store.getState() as any).auth._persist.rehydrated).toBe(true)
})
