import { expect, test, vi } from 'vitest'
import { combineReducers, createStore } from 'redux'

import persistReducer from '../src/persistReducer'
import persistStore from '../src/persistStore'
import createMemoryStorage from './utils/createMemoryStorage'
import brokenStorage from './utils/brokenStorage'
import sleep from './utils/sleep'

const reducer = () => ({})
const config = {
  key: 'persist-reducer-test',
  version: 1,
  storage: createMemoryStorage(),
  debug: true,
  timeout: 5,
}

test('multiple persistReducers work together', async () => {
  const r1 = persistReducer(config, reducer)
  const r2 = persistReducer(config, reducer)
  const rootReducer = combineReducers({ r1, r2 })
  const store = createStore(rootReducer)
  const bootstrapped = await new Promise(resolve => {
    const persistor = persistStore(store, {}, () => resolve(persistor.getState().bootstrapped))
  })
  expect(bootstrapped).toBe(true)
})

test('persistStore timeout 0 never bootstraps', async () => {
  const r1 = persistReducer({...config, storage: brokenStorage, timeout: 0}, reducer)
  const rootReducer = combineReducers({ r1 })
  const store = createStore(rootReducer)
  const onBootstrap = vi.fn()
  const persistor = persistStore(store, undefined, onBootstrap)
  await sleep(10)
  expect(onBootstrap).not.toHaveBeenCalled()
  expect(persistor.getState().bootstrapped).toBe(false)
})


test('persistStore timeout forces bootstrap', async () => {
  const r1 = persistReducer({...config, storage: brokenStorage}, reducer)
  const rootReducer = combineReducers({ r1 })
  const store = createStore(rootReducer)
  const bootstrapped = await Promise.race([
    new Promise(resolve => {
      const persistor = persistStore(store, undefined, () => resolve(persistor.getState().bootstrapped))
    }),
    sleep(10).then(() => 'not bootstrapped after 10ms'),
  ])
  expect(bootstrapped).toBe(true)
})
