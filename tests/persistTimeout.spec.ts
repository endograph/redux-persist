/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'ava'
import sinon from 'sinon'
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

// Serial: one test fakes the global setTimeout.
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

test.serial('bootstraps without a timeout error when storage is empty', async t => {
  const { store, rehydrates } = setup({ storage: createMemoryStorage(), timeout: 1000 })
  const started = Date.now()
  await bootstrap(store)
  t.true(Date.now() - started < 500)
  t.is(rehydrates.length, 1)
  t.is(rehydrates[0].err, undefined)
})

test.serial('clears the timeout once rehydrated', async t => {
  const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    const persistedReducer = persistReducer(
      { key: 'timeout-test', storage: createMemoryStorage() },
      reducer
    )
    const rehydrate = sinon.spy()
    persistedReducer(undefined, attachHandle({ type: PERSIST }, { register: () => {}, rehydrate }))
    t.is(clock.countTimers(), 1)
    await new Promise(resolve => setImmediate(resolve))
    t.is(rehydrate.callCount, 1)
    t.is(clock.countTimers(), 0)
  } finally {
    clock.restore()
  }
})

test.serial('persist() after rehydration does not dispatch a timeout error', async t => {
  const { store, rehydrates } = setup({ storage: createMemoryStorage(), timeout: 100 })
  const persistor = await bootstrap(store)
  persistor.persist()
  await sleep(200)
  t.is(rehydrates.length, 1)
  t.is(rehydrates[0].err, undefined)
})

test.serial('persist() before rehydration finishes does not dispatch a timeout error', async t => {
  const { store, rehydrates } = setup({ storage: createSlowStorage(50), timeout: 100 })
  const persistor = persistStore(store)
  persistor.persist()
  await sleep(200)
  t.is(rehydrates.length, 1)
  t.is(rehydrates[0].err, undefined)
})

test.serial('persist() after pause() keeps and saves changes made while paused', async t => {
  const storage = createMemoryStorage()
  const { store } = setup({ storage, timeout: 100 })
  const persistor = await bootstrap(store)
  store.dispatch({ type: 'SET', x: 1 })
  await persistor.flush()

  persistor.pause()
  store.dispatch({ type: 'SET', x: 2 })
  persistor.persist()
  await persistor.flush()

  t.is(store.getState().x, 2)
  const stored = JSON.parse(await storage.getItem('persist:timeout-test'))
  t.is(JSON.parse(stored.x), 2)
})
