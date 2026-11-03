/* eslint-disable @typescript-eslint/no-explicit-any */
// #1397, #1281: a storage engine may return plain values instead of promises
// (a synchronous engine, or a test mock like jest.fn()), or throw.
import { expect, test } from 'vitest'
import { legacy_createStore as createStore } from 'redux'

import { persistReducer, persistStore, REHYDRATE } from '../src'
import sleep from './utils/sleep'

const reducer = (state: any = { count: 0 }, action: any) =>
  action.type === 'INC' ? { ...state, count: state.count + 1 } : state

const quietly = async (fn: () => Promise<void>) => {
  const error = console.error
  console.error = () => {}
  try { await fn() } finally { console.error = error }
}

test('a storage engine that returns values instead of promises', async () => {
  const data: Record<string, string> = {}
  const storage = {
    getItem: (key: string) => data[key],
    setItem: (key: string, value: string) => { data[key] = value },
    removeItem: (key: string) => { delete data[key] },
  }
  const store = createStore(persistReducer({ key: 'root', storage }, reducer))
  const persistor = persistStore(store)
  await sleep(10)
  expect(persistor.getState().bootstrapped).toBe(true)

  store.dispatch({ type: 'INC' })
  await persistor.flush()
  expect(JSON.parse(JSON.parse(data['persist:root']).count)).toBe(1)

  // a new store reads it back
  const next = createStore(persistReducer({ key: 'root', storage }, reducer))
  persistStore(next)
  await sleep(10)
  expect(next.getState().count).toBe(1)

  await persistor.purge()
  expect('persist:root' in data).toBe(false)
})

test('a mock storage whose methods return undefined', async () => {
  const storage = { getItem: () => undefined, setItem: () => undefined, removeItem: () => undefined }
  const store = createStore(persistReducer({ key: 'root', storage }, reducer))
  const persistor = persistStore(store)
  await sleep(10)
  expect(persistor.getState().bootstrapped).toBe(true)
  store.dispatch({ type: 'INC' })
  await expect(persistor.flush()).resolves.not.toThrow()
  await expect(persistor.purge()).resolves.not.toThrow()
  expect(store.getState().count).toBe(1)
})

test('a storage engine that throws is handled like a failed read or write', async () => {
  const rehydrates: any[] = []
  const writeErrors: any[] = []
  const storage = {
    getItem: () => { throw new Error('read failed') },
    setItem: () => { throw new Error('write failed') },
    removeItem: () => { throw new Error('remove failed') },
  }
  await quietly(async () => {
    const store = createStore(
      persistReducer({ key: 'root', storage, writeFailHandler: err => writeErrors.push(err) }, (state: any, action: any) => {
        if (action.type === REHYDRATE) rehydrates.push(action)
        return reducer(state, action)
      })
    )
    let persistor: any
    expect(() => { persistor = persistStore(store) }).not.toThrow()
    await sleep(10)
    expect(persistor.getState().bootstrapped).toBe(true)
    expect(rehydrates).toHaveLength(1)
    expect(rehydrates[0].err.message).toBe('read failed')

    // writes stay off after a failed read; purging discards the unreadable
    // data and resumes them
    await expect(persistor.purge()).rejects.toThrow('remove failed')
    store.dispatch({ type: 'INC' })
    await persistor.flush()
  })
  expect(writeErrors).toHaveLength(1)
  expect(writeErrors[0].message).toBe('write failed')
})

test('a callback-style getItem is a failed read, not empty storage', async () => {
  const STORED = JSON.stringify({ count: JSON.stringify(5), _persist: JSON.stringify({ version: -1, rehydrated: true }) })
  const data: Record<string, string> = { 'persist:root': STORED }
  const storage = {
    getItem: (key: string, callback?: (err: any, value?: string) => void) => { setTimeout(() => callback && callback(null, data[key])) },
    setItem: (key: string, value: string) => { data[key] = value },
    removeItem: (key: string) => { delete data[key] },
  }
  await quietly(async () => {
    const store = createStore(persistReducer({ key: 'root', storage }, reducer))
    const persistor = persistStore(store)
    await sleep(10)
    store.dispatch({ type: 'INC' })
    await persistor.flush()
  })
  expect(data['persist:root']).toBe(STORED)
})

test('a read that rejects without a reason is a failed read, not empty storage', async () => {
  const STORED = JSON.stringify({ count: JSON.stringify(5), _persist: JSON.stringify({ version: -1, rehydrated: true }) })
  const data: Record<string, string> = { 'persist:root': STORED }
  const rehydrates: any[] = []
  const storage = {
    getItem: () => Promise.reject(),
    setItem: (key: string, value: string) => { data[key] = value; return Promise.resolve() },
    removeItem: (key: string) => { delete data[key]; return Promise.resolve() },
  }
  await quietly(async () => {
    const store = createStore(persistReducer({ key: 'root', storage }, (state: any, action: any) => {
      if (action.type === REHYDRATE) rehydrates.push(action)
      return reducer(state, action)
    }))
    const persistor = persistStore(store)
    await sleep(10)
    store.dispatch({ type: 'INC' })
    await persistor.flush()
  })
  expect(data['persist:root']).toBe(STORED)
  expect(rehydrates[0].err).toBeTruthy()
})
