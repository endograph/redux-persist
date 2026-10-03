import { legacy_createStore as createStore } from 'redux'

import persistCombineReducers from '../src/persistCombineReducers'
import persistStore from '../src/persistStore'
import createMemoryStorage from './utils/createMemoryStorage'

import test from 'ava'

const config = {
  key: 'TestConfig',
  storage: createMemoryStorage()
}

test('persistCombineReducers returns a function', t => {
  const reducer = persistCombineReducers(config, {
    foo: () => ({})
  })

  t.is(typeof reducer, 'function')
})

test('persistCombineReducers merges two levels deep of state', async t => {
  const storage = createMemoryStorage()
  // stored before `settings.fontSize` existed
  await storage.setItem('persist:TwoLevels', JSON.stringify({
    settings: JSON.stringify({ theme: 'light' }),
    _persist: JSON.stringify({ version: -1, rehydrated: true }),
  }))
  const settings = (state = { theme: 'dark', fontSize: 14 }) => state
  const store = createStore(persistCombineReducers({ key: 'TwoLevels', storage }, { settings }))
  await new Promise(resolve => persistStore(store, null, () => resolve(undefined)))
  // the stored theme is restored, and the new fontSize default is kept
  t.deepEqual(store.getState().settings, { theme: 'light', fontSize: 14 })
})
