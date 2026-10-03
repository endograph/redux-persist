import test from 'ava'
import sinon from 'sinon'

import persistReducer from '../src/persistReducer'
import createMemoryStorage from './utils/createMemoryStorage'
import { PERSIST } from '../src/constants'
import sleep from './utils/sleep'

const reducer = () => ({})
const config = {
  key: 'persist-reducer-test',
  version: 1,
  storage: createMemoryStorage()
}

test('persistedReducer does not automatically set _persist state', t => {
  const persistedReducer = persistReducer(config, reducer)
  const state = persistedReducer({}, {type: "UNDEFINED"})
  console.log('state', state)
  t.is(undefined, state._persist)
})

test('persistedReducer does returns versioned, rehydrate tracked _persist state upon PERSIST', t => {
  const persistedReducer = persistReducer(config, reducer)
  const register = sinon.spy()
  const rehydrate = sinon.spy()
  const state = persistedReducer({}, { type: PERSIST, register, rehydrate })
  t.deepEqual({ version: 1, rehydrated: false}, state._persist)
})

test('persistedReducer calls register and rehydrate after PERSIST', async (t) => {
  const persistedReducer = persistReducer(config, reducer)
  const register = sinon.spy()
  const rehydrate = sinon.spy()
  persistedReducer({}, { type: PERSIST, register, rehydrate })
  await sleep(5000)
  t.is(register.callCount, 1)
  t.is(rehydrate.callCount, 1)
})
