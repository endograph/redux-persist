/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from 'vitest'
import { configureStore, createSlice } from '@reduxjs/toolkit'

import { persistReducer, persistStore } from '../src'
import createMemoryStorage from './utils/createMemoryStorage'

const counter = createSlice({
  name: 'counter',
  initialState: { value: 0 },
  reducers: { increment: state => { state.value += 1 } },
})

// RTK's default middleware warns via console.error about non-serializable
// actions; redux-persist should work with it without any ignoredActions setup.
const captureConsoleErrors = () => {
  const errors: any[][] = []
  const original = console.error
  console.error = (...args: any[]) => { errors.push(args) }
  return { errors, restore: () => { console.error = original } }
}

test('works with configureStore defaults without serializable warnings', async () => {
  const storage = createMemoryStorage()
  const { errors, restore } = captureConsoleErrors()
  try {
    const store = configureStore({
      reducer: persistReducer({ key: 'rtk', storage }, counter.reducer),
    })
    const persistor = persistStore(store)
    await new Promise(resolve => {
      const unsubscribe = persistor.subscribe(() => {
        if (persistor.getState().bootstrapped) { unsubscribe(); resolve(undefined) }
      })
    })
    store.dispatch(counter.actions.increment())
    await persistor.flush()
    await persistor.purge()
    persistor.pause()
    persistor.persist()
    expect(store.getState().value).toBe(1)
  } finally {
    restore()
  }
  expect(errors.map(args => String(args[0]).slice(0, 120))).toStrictEqual([])
})

test('a failing storage read does not produce serializable warnings', async () => {
  const storage = {
    ...createMemoryStorage(),
    getItem: () => Promise.reject(new Error('disk unavailable')),
  }
  const { errors, restore } = captureConsoleErrors()
  let rehydrateErr: any
  try {
    const store = configureStore({
      reducer: persistReducer({ key: 'rtk-fail', storage }, counter.reducer),
      middleware: getDefault => getDefault().concat(() => (next: any) => (action: any) => {
        if (action.type === 'persist/REHYDRATE') rehydrateErr = action.err
        return next(action)
      }),
    })
    const persistor = persistStore(store)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(persistor.getState().bootstrapped).toBe(true)
  } finally {
    restore()
  }
  expect(rehydrateErr && rehydrateErr.message).toBe('disk unavailable')
  expect(
    errors.map(args => String(args[0])).filter(message => message.includes('non-serializable'))
  ).toStrictEqual([])
})
