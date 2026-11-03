import { expect, test, vi } from 'vitest'

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

test('persistedReducer does not automatically set _persist state', () => {
  const persistedReducer = persistReducer(config, reducer)
  const state = persistedReducer({}, {type: "UNDEFINED"})
  console.log('state', state)
  // the type includes _persist, but it is only set once PERSIST is handled
  expect(state._persist as unknown).toBeUndefined()
})

test('persistedReducer does returns versioned, rehydrate tracked _persist state upon PERSIST', () => {
  const persistedReducer = persistReducer(config, reducer)
  const register = vi.fn()
  const rehydrate = vi.fn()
  const state = persistedReducer({}, attachHandle({ type: PERSIST }, { register, rehydrate }))
  expect(state._persist).toStrictEqual({ version: 1, rehydrated: false })
})

test('persistedReducer calls register and rehydrate after PERSIST', async () => {
  const persistedReducer = persistReducer(config, reducer)
  const register = vi.fn()
  const rehydrate = vi.fn()
  persistedReducer({}, attachHandle({ type: PERSIST }, { register, rehydrate }))
  await sleep(50)
  expect(register).toHaveBeenCalledTimes(1)
  expect(rehydrate).toHaveBeenCalledTimes(1)
})

test('persistedReducer rehydrates immediately when storage is empty', async () => {
  const persistedReducer = persistReducer(config, reducer)
  const register = vi.fn()
  const rehydrate = vi.fn()
  persistedReducer({}, attachHandle({ type: PERSIST }, { register, rehydrate }))
  await sleep(50)
  expect(rehydrate).toHaveBeenCalledTimes(1)
})

test('persistedReducer ignores PERSIST and PURGE actions without a persistor handle (devtools replay)', async () => {
  const storage = createMemoryStorage()
  await storage.setItem('persist:replay', JSON.stringify({ a: '1' }))
  const persistedReducer = persistReducer({ key: 'replay', storage }, reducer)
  const warn = console.warn
  console.warn = () => {}
  try {
    expect(() => persistedReducer({}, { type: PERSIST })).not.toThrow()
    persistedReducer({}, { type: PURGE })
  } finally {
    console.warn = warn
  }
  await sleep(10)
  expect(await storage.getItem('persist:replay')).toBe(JSON.stringify({ a: '1' }))
})
