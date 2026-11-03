/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from 'vitest'
import { createStore } from 'redux'

import getStoredState from '../src/getStoredState'
import persistReducer from '../src/persistReducer'
import persistStore from '../src/persistStore'
import createMemoryStorage from './utils/createMemoryStorage'

const INCREMENT = 'INCREMENT'

interface StateObject {
  [key: string]: any;
}
const initialState: StateObject = { a: 0, b: 10, c: 100}
const reducer = (state = initialState, { type }: { type: any }) => {
  console.log('action', type)
  if (type === INCREMENT) {
    const result = state
    Object.keys(state).forEach((key) => {
      result[key] = state[key] + 1
    })
    return result
  }
  return state
}

const memoryStorage = createMemoryStorage()

const config = {
  key: 'persist-reducer-test',
  version: 1,
  storage: memoryStorage,
  debug: true,
  throttle: 1000,
}

test('state before flush is not updated, after flush is', async () => {
  const rootReducer = persistReducer(config, reducer)
  const store = createStore(rootReducer)
  const persistor = await new Promise<ReturnType<typeof persistStore>>(resolve => {
    const persistor = persistStore(store, {}, () => resolve(persistor))
  })
  store.dispatch({ type: INCREMENT })
  const state = store.getState()
  const storedPreFlush = await getStoredState(config)
  expect(storedPreFlush && storedPreFlush.c).not.toBe(state.c)
  await persistor.flush()
  const storedPostFlush = await getStoredState(config)
  expect(storedPostFlush && storedPostFlush.c).toBe(state.c)
})
