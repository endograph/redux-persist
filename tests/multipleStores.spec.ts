/* eslint-disable @typescript-eslint/no-explicit-any */
// One persisted reducer used by several stores, as with a module-level reducer
// and a store per server request or per test. Each store's persistence state
// (paused, purged, read failures, pending writes) must be its own.
import test from 'ava'
import { legacy_createStore as createStore } from 'redux'

import { persistReducer, persistStore } from '../src'
import sleep from './utils/sleep'

const STORED = JSON.stringify({
  _persist: JSON.stringify({ version: -1, rehydrated: true }),
  count: JSON.stringify(5),
})

const reducer = (state: any = { count: 0 }, action: any) =>
  action.type === 'SET' ? { ...state, count: action.count } : state

const createStorage = (initial: Record<string, any> = {}) => {
  const data: Record<string, any> = { ...initial }
  return {
    data,
    failNextRead: false,
    getItem(key: string) {
      if (this.failNextRead) { this.failNextRead = false; return Promise.reject(new Error('read failed')) }
      return Promise.resolve(data[key])
    },
    setItem: (key: string, value: any) => { data[key] = value; return Promise.resolve() },
    removeItem: (key: string) => { delete data[key]; return Promise.resolve() },
  }
}

const bootstrap = (store: any) =>
  new Promise<any>(resolve => {
    const persistor = persistStore(store, null, () => resolve(persistor))
  })

const quietly = async (fn: () => Promise<void>) => {
  const { error, warn } = console
  console.error = () => {}
  console.warn = () => {}
  try { await fn() } finally { console.error = error; console.warn = warn }
}

test('purging one store does not stop another store from rehydrating', async t => {
  const storage = createStorage({ 'persist:root': STORED })
  const persistedReducer = persistReducer({ key: 'root', storage }, reducer)

  const first = createStore(persistedReducer)
  const firstPersistor = await bootstrap(first)
  await firstPersistor.purge()

  storage.data['persist:root'] = STORED
  const second = createStore(persistedReducer)
  await bootstrap(second)
  t.is(second.getState().count, 5)
})

test('pausing one store does not pause another', async t => {
  const storage = createStorage()
  const persistedReducer = persistReducer({ key: 'root', storage }, reducer)

  const first = createStore(persistedReducer)
  const firstPersistor = await bootstrap(first)
  const second = createStore(persistedReducer)
  const secondPersistor = await bootstrap(second)

  firstPersistor.pause()
  second.dispatch({ type: 'SET', count: 7 })
  await secondPersistor.flush()
  t.is(JSON.parse(JSON.parse(storage.data['persist:root']).count), 7)
})

test('a failed read in one store does not block writes in another', async t => {
  const storage = createStorage()
  const persistedReducer = persistReducer({ key: 'root', storage }, reducer)

  await quietly(async () => {
    storage.failNextRead = true
    await bootstrap(createStore(persistedReducer))
  })
  const second = createStore(persistedReducer)
  const secondPersistor = await bootstrap(second)
  second.dispatch({ type: 'SET', count: 7 })
  await secondPersistor.flush()
  t.is(JSON.parse(JSON.parse(storage.data['persist:root']).count), 7)
})

test('each store writes its own state', async t => {
  const firstStorage = createStorage()
  const persistedReducer = persistReducer({ key: 'root', storage: firstStorage }, reducer)

  const first = createStore(persistedReducer)
  const firstPersistor = await bootstrap(first)
  first.dispatch({ type: 'SET', count: 1 })
  await firstPersistor.flush()

  const second = createStore(persistedReducer)
  await bootstrap(second)
  second.dispatch({ type: 'SET', count: 2 })
  await sleep(10)

  // the first store's next write must contain its own state, not the second's
  first.dispatch({ type: 'SET', count: 3 })
  await firstPersistor.flush()
  t.is(JSON.parse(JSON.parse(firstStorage.data['persist:root']).count), 3)
})

test('a store created with preloaded state that includes _persist still bootstraps', async t => {
  // e.g. server-rendered state passed to the client store
  const storage = createStorage({ 'persist:root': STORED })
  const persistedReducer = persistReducer({ key: 'root', storage }, reducer)
  const preloaded = { count: 1, _persist: { version: -1, rehydrated: true } }
  const store = createStore(persistedReducer, preloaded as any)
  const bootstrapped = await Promise.race([bootstrap(store).then(() => true), sleep(500).then(() => false)])
  t.true(bootstrapped)
  t.is(store.getState().count, 5)
})

test('after replaceReducer with a new persistReducer (hot reloading), state keeps being saved', async t => {
  const storage = createStorage()
  const store = createStore(persistReducer({ key: 'root', storage }, reducer))
  const persistor = await bootstrap(store)

  // docs/hot-module-replacement.md: replace with a freshly created persisted reducer
  store.replaceReducer(persistReducer({ key: 'root', storage }, reducer))
  store.dispatch({ type: 'SET', count: 9 })
  await persistor.flush()
  t.is(JSON.parse(JSON.parse(storage.data['persist:root']).count), 9)
})
