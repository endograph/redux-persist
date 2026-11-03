import { expect, test, vi } from 'vitest'

import configureStore from 'redux-mock-store'

import persistStore from '../src/persistStore'
import { PERSIST, REHYDRATE } from '../src/constants'
import { getHandle } from '../src/persistorHandle'
import find from './utils/find'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleOf = (action: any) => getHandle(action) as Required<NonNullable<ReturnType<typeof getHandle>>>

const mockStore = configureStore([])

test('persistStore dispatches PERSIST action', () => {
  const store = mockStore()
  persistStore(store)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })
  expect(persistAction).toBeTruthy()
})

test('PERSIST action is a plain serializable object', () => {
  const store = mockStore()
  persistStore(store)
  const persistAction = find(store.getActions(), { type: PERSIST })
  expect(Object.keys(persistAction)).toStrictEqual(['type'])
  expect(JSON.stringify(persistAction)).toBe(JSON.stringify({ type: PERSIST }))
  expect(typeof handleOf(persistAction).register).toBe('function')
})

test('register method adds a key to the registry', () => {
  const store = mockStore()
  const persistor = persistStore(store)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })
  handleOf(persistAction).register('canary')
  expect(persistor.getState().registry).toStrictEqual(['canary'])
})

test('rehydrate method fires with the expected shape', () => {
  const store = mockStore()
  persistStore(store)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })
  handleOf(persistAction).rehydrate('canary', { foo: 'bar' }, null)
  const rehydrateAction = find(actions, { type: REHYDRATE })
  expect(rehydrateAction).toStrictEqual({ type: REHYDRATE, key: 'canary', payload: { foo: 'bar' }, err: null })
})

test('rehydrate method removes provided key from registry', () => {
  const store = mockStore()
  const persistor = persistStore(store)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })

  // register canary
  handleOf(persistAction).register('canary')
  expect(persistor.getState().registry).toStrictEqual(['canary'])

  // rehydrate canary
  handleOf(persistAction).rehydrate('canary', { foo: 'bar' }, null)
  expect(persistor.getState().registry).toStrictEqual([])
})

test('rehydrate method removes exactly one of provided key from registry', () => {
  const store = mockStore()
  const persistor = persistStore(store)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })

  // register canary twice
  handleOf(persistAction).register('canary')
  handleOf(persistAction).register('canary')
  expect(persistor.getState().registry).toStrictEqual(['canary', 'canary'])

  // rehydrate canary
  handleOf(persistAction).rehydrate('canary', { foo: 'bar' }, null)
  expect(persistor.getState().registry).toStrictEqual(['canary'])
})

test('once registry is cleared for first time, persistor is flagged as bootstrapped', () => {
  const store = mockStore()
  const persistor = persistStore(store)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })

  handleOf(persistAction).register('canary')
  expect(persistor.getState().bootstrapped).toBe(false)
  handleOf(persistAction).rehydrate('canary', { foo: 'bar' }, null)
  expect(persistor.getState().bootstrapped).toBe(true)
})

test('once persistor is flagged as bootstrapped, further registry changes do not affect this value', () => {
  const store = mockStore()
  const persistor = persistStore(store)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })

  handleOf(persistAction).register('canary')
  expect(persistor.getState().bootstrapped).toBe(false)
  handleOf(persistAction).rehydrate('canary', { foo: 'bar' }, null)
  expect(persistor.getState().bootstrapped).toBe(true)

  // add canary back, registry is updated but bootstrapped remains true
  handleOf(persistAction).register('canary')
  expect(persistor.getState().registry).toStrictEqual(['canary'])
  expect(persistor.getState().bootstrapped).toBe(true)
})

test('persistStore calls bootstrapped callback (at most once) if provided', () => {
  const store = mockStore()
  const bootstrappedCb = vi.fn()  
  persistStore(store, {}, bootstrappedCb)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })
  
  handleOf(persistAction).register('canary')
  handleOf(persistAction).rehydrate('canary', { foo: 'bar' }, null)
  expect(bootstrappedCb).toHaveBeenCalledTimes(1)

  // further rehydrates do not trigger the cb
  handleOf(persistAction).register('canary')
  handleOf(persistAction).rehydrate('canary', { foo: 'bar' }, null)
  expect(bootstrappedCb).toHaveBeenCalledTimes(1)
})
