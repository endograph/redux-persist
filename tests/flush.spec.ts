/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'ava'
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

test('state before flush is not updated, after flush is', t => {
  return new Promise<void>((resolve) => {
    const rootReducer = persistReducer(config, reducer)
    const store = createStore(rootReducer)
    const persistor = persistStore(store, {}, async () => {
      store.dispatch({ type: INCREMENT })
      const state = store.getState()
      const storedPreFlush = await getStoredState(config)
      t.not(storedPreFlush && storedPreFlush.c, state.c)
      await persistor.flush()
      const storedPostFlush = await getStoredState(config)
      t.is(storedPostFlush && storedPostFlush.c, state.c)
      resolve()
    })
  })
})
