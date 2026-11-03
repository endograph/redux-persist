/* eslint-disable @typescript-eslint/no-explicit-any */
// #719: a reducer that throws while handling REHYDRATE must not leave the app
// unbootstrapped, dispatch a bogus timeout, or overwrite stored data.
import { expect, test } from 'vitest'
import { applyMiddleware, legacy_createStore as createStore } from 'redux'

import { persistReducer, persistStore, REHYDRATE } from '../src'
import sleep from './utils/sleep'

const STORED = JSON.stringify({
  _persist: JSON.stringify({ version: -1, rehydrated: true }),
  count: JSON.stringify(5),
})

const createStorage = () => {
  const data: Record<string, any> = { 'persist:root': STORED }
  return {
    data,
    getItem: (key: string) => Promise.resolve(data[key]),
    setItem: (key: string, value: any) => { data[key] = value; return Promise.resolve() },
    removeItem: (key: string) => { delete data[key]; return Promise.resolve() },
  }
}

const setup = (storage: ReturnType<typeof createStorage>) => {
  const rehydrates: any[] = []
  const errors: any[][] = []
  const original = console.error
  console.error = (...args: any[]) => { errors.push(args) }
  const reducer = (state: any = { count: 0 }, action: any) => {
    if (action.type === REHYDRATE) throw new Error('reducer bug')
    return action.type === 'SET' ? { count: action.count } : state
  }
  const record = () => (next: any) => (action: any) => {
    if (action.type === REHYDRATE) rehydrates.push(action)
    return next(action)
  }
  const store = createStore(persistReducer({ key: 'root', storage, timeout: 100 }, reducer), applyMiddleware(record))
  let bootstrapped = false
  const persistor = persistStore(store, null, () => { bootstrapped = true })
  return { store, persistor, rehydrates, errors, isBootstrapped: () => bootstrapped, restore: () => { console.error = original } }
}

test('the app still bootstraps when a reducer throws on REHYDRATE', async () => {
  const { persistor, isBootstrapped, restore } = setup(createStorage())
  await sleep(20)
  restore()
  expect(persistor.getState().bootstrapped).toBe(true)
  expect(isBootstrapped()).toBe(true)
})

test('no misleading timeout REHYDRATE follows', async () => {
  const { rehydrates, restore } = setup(createStorage())
  await sleep(200) // past the 100ms timeout
  restore()
  expect(rehydrates).toHaveLength(1)
  expect(rehydrates[0].err).toBeUndefined()
})

test('stored data is not overwritten, and the error is reported', async () => {
  const storage = createStorage()
  const { store, persistor, errors, restore } = setup(storage)
  await sleep(20)
  store.dispatch({ type: 'SET', count: 1 })
  await persistor.flush()
  restore()
  expect(storage.data['persist:root']).toBe(STORED)
  const reported = errors.find(args => String(args[0]).includes('threw while handling REHYDRATE'))
  expect(reported).toBeTruthy()
  expect(reported && reported[1] && reported[1].message).toBe('reducer bug')
})
