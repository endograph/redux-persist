/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, vi } from 'vitest'
import { applyMiddleware, createStore } from 'redux'

import persistReducer from '../src/persistReducer'
import { attachHandle } from '../src/persistorHandle'
import persistStore from '../src/persistStore'
import { PERSIST, REHYDRATE } from '../src/constants'
import createMemoryStorage from './utils/createMemoryStorage'
import sleep from './utils/sleep'

const reducer = (state = { x: 0 }, action: any) =>
  action.type === 'SET' ? { x: action.x } : state

// Delays getItem so tests can act while rehydration is still in flight.
const createSlowStorage = (delay: number) => {
  const storage = createMemoryStorage()
  return {
    ...storage,
    getItem: (key: string) => sleep(delay).then(() => storage.getItem(key)),
  }
}

const setup = (config: Record<string, any>) => {
  const rehydrates: any[] = []
  const recordRehydrates = () => (next: any) => (action: any) => {
    if (action.type === REHYDRATE) rehydrates.push(action)
    return next(action)
  }
  const store = createStore(
    persistReducer({ key: 'timeout-test', ...config } as any, reducer),
    applyMiddleware(recordRehydrates)
  )
  return { store, rehydrates }
}

const bootstrap = (store: any) =>
  new Promise<any>(resolve => {
    const persistor = persistStore(store, undefined, () => resolve(persistor))
  })

test('bootstraps without a timeout error when storage is empty', async () => {
  const { store, rehydrates } = setup({ storage: createMemoryStorage(), timeout: 1000 })
  const started = Date.now()
  await bootstrap(store)
  expect(Date.now() - started).toBeLessThan(500)
  expect(rehydrates).toHaveLength(1)
  expect(rehydrates[0].err).toBeUndefined()
})

test('clears the timeout once rehydrated', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    const persistedReducer = persistReducer(
      { key: 'timeout-test', storage: createMemoryStorage() },
      reducer
    )
    const rehydrate = vi.fn()
    persistedReducer(undefined, attachHandle({ type: PERSIST }, { register: () => {}, rehydrate }))
    expect(vi.getTimerCount()).toBe(1)
    await new Promise(resolve => setImmediate(resolve))
    expect(rehydrate).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})

test('persist() after rehydration does not dispatch a timeout error', async () => {
  const { store, rehydrates } = setup({ storage: createMemoryStorage(), timeout: 100 })
  const persistor = await bootstrap(store)
  persistor.persist()
  await sleep(200)
  expect(rehydrates).toHaveLength(1)
  expect(rehydrates[0].err).toBeUndefined()
})

test('persist() before rehydration finishes does not dispatch a timeout error', async () => {
  const { store, rehydrates } = setup({ storage: createSlowStorage(50), timeout: 100 })
  const persistor = persistStore(store)
  persistor.persist()
  await sleep(200)
  expect(rehydrates).toHaveLength(1)
  expect(rehydrates[0].err).toBeUndefined()
})

test('persist() after pause() keeps and saves changes made while paused', async () => {
  const storage = createMemoryStorage()
  const { store } = setup({ storage, timeout: 100 })
  const persistor = await bootstrap(store)
  store.dispatch({ type: 'SET', x: 1 })
  await persistor.flush()

  persistor.pause()
  store.dispatch({ type: 'SET', x: 2 })
  persistor.persist()
  await persistor.flush()

  expect(store.getState().x).toBe(2)
  const stored = JSON.parse(await storage.getItem('persist:timeout-test'))
  expect(JSON.parse(stored.x)).toBe(2)
})
