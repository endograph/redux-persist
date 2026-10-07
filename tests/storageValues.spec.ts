/* eslint-disable @typescript-eslint/no-explicit-any */
// #1397, #1281: a storage engine may return plain values instead of promises
// (a synchronous engine, or a test mock like jest.fn()), or throw.
import test from 'ava'
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

test('a storage engine that returns values instead of promises', async t => {
  const data: Record<string, string> = {}
  const storage = {
    getItem: (key: string) => data[key],
    setItem: (key: string, value: string) => { data[key] = value },
    removeItem: (key: string) => { delete data[key] },
  }
  const store = createStore(persistReducer({ key: 'root', storage }, reducer))
  const persistor = persistStore(store)
  await sleep(10)
  t.true(persistor.getState().bootstrapped)

  store.dispatch({ type: 'INC' })
  await persistor.flush()
  t.is(JSON.parse(JSON.parse(data['persist:root']).count), 1)

  // a new store reads it back
  const next = createStore(persistReducer({ key: 'root', storage }, reducer))
  persistStore(next)
  await sleep(10)
  t.is(next.getState().count, 1)

  await persistor.purge()
  t.false('persist:root' in data)
})

test('a mock storage whose methods return undefined', async t => {
  const storage = { getItem: () => undefined, setItem: () => undefined, removeItem: () => undefined }
  const store = createStore(persistReducer({ key: 'root', storage }, reducer))
  const persistor = persistStore(store)
  await sleep(10)
  t.true(persistor.getState().bootstrapped)
  store.dispatch({ type: 'INC' })
  await t.notThrowsAsync(persistor.flush())
  await t.notThrowsAsync(persistor.purge())
  t.is(store.getState().count, 1)
})

test.serial('a storage engine that throws is handled like a failed read or write', async t => {
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
    t.notThrows(() => { persistor = persistStore(store) })
    await sleep(10)
    t.true(persistor.getState().bootstrapped)
    t.is(rehydrates.length, 1)
    t.is(rehydrates[0].err.message, 'read failed')

    // writes stay off after a failed read; purging discards the unreadable
    // data and resumes them
    await t.throwsAsync(persistor.purge(), { message: 'remove failed' })
    store.dispatch({ type: 'INC' })
    await persistor.flush()
  })
  t.is(writeErrors.length, 1)
  t.is(writeErrors[0].message, 'write failed')
})
