import test from 'ava'
import sinon from 'sinon'

import persistReducer from '../src/persistReducer'
import { attachHandle } from '../src/persistorHandle'
import createMemoryStorage from './utils/createMemoryStorage'
import { PERSIST, PURGE } from '../src/constants'
import sleep from './utils/sleep'

// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
const reducer = (state = {}, action: any) => state
const config = {
  key: 'persist-reducer-test',
  version: 1,
  storage: createMemoryStorage()
}

test('persistedReducer does not automatically set _persist state', t => {
  const persistedReducer = persistReducer(config, reducer)
  const state = persistedReducer({}, {type: "UNDEFINED"})
  console.log('state', state)
  // the type includes _persist, but it is only set once PERSIST is handled
  t.is(state._persist as unknown, undefined)
})

test('persistedReducer does returns versioned, rehydrate tracked _persist state upon PERSIST', t => {
  const persistedReducer = persistReducer(config, reducer)
  const register = sinon.spy()
  const rehydrate = sinon.spy()
  const state = persistedReducer({}, attachHandle({ type: PERSIST }, { register, rehydrate }))
  t.deepEqual({ version: 1, rehydrated: false}, state._persist)
})

test('persistedReducer calls register and rehydrate after PERSIST', async (t) => {
  const persistedReducer = persistReducer(config, reducer)
  const register = sinon.spy()
  const rehydrate = sinon.spy()
  persistedReducer({}, attachHandle({ type: PERSIST }, { register, rehydrate }))
  await sleep(50)
  t.is(register.callCount, 1)
  t.is(rehydrate.callCount, 1)
})

test('persistedReducer rehydrates immediately when storage is empty', async (t) => {
  const persistedReducer = persistReducer(config, reducer)
  const register = sinon.spy()
  const rehydrate = sinon.spy()
  persistedReducer({}, attachHandle({ type: PERSIST }, { register, rehydrate }))
  await sleep(50)
  t.is(rehydrate.callCount, 1)
})

test('persistedReducer ignores PERSIST and PURGE actions without a persistor handle (devtools replay)', async (t) => {
  const storage = createMemoryStorage()
  await storage.setItem('persist:replay', JSON.stringify({ a: '1' }))
  const persistedReducer = persistReducer({ key: 'replay', storage }, reducer)
  const warn = console.warn
  console.warn = () => {}
  try {
    t.notThrows(() => persistedReducer({}, { type: PERSIST }))
    persistedReducer({}, { type: PURGE })
  } finally {
    console.warn = warn
  }
  await sleep(10)
  t.is(await storage.getItem('persist:replay'), JSON.stringify({ a: '1' }))
})
