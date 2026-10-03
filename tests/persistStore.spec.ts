import test from 'ava'
import sinon from 'sinon'

import configureStore from 'redux-mock-store'

import persistStore from '../src/persistStore'
import { PERSIST, REHYDRATE } from '../src/constants'
import { getHandle } from '../src/persistorHandle'
import find from './utils/find'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleOf = (action: any) => getHandle(action) as Required<NonNullable<ReturnType<typeof getHandle>>>

const mockStore = configureStore([])

test('persistStore dispatches PERSIST action', t => {
  const store = mockStore()
  persistStore(store)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })
  t.truthy(persistAction)
})

test('PERSIST action is a plain serializable object', t => {
  const store = mockStore()
  persistStore(store)
  const persistAction = find(store.getActions(), { type: PERSIST })
  t.deepEqual(Object.keys(persistAction), ['type'])
  t.is(JSON.stringify(persistAction), JSON.stringify({ type: PERSIST }))
  t.is(typeof handleOf(persistAction).register, 'function')
})

test('register method adds a key to the registry', t => {
  const store = mockStore()
  const persistor = persistStore(store)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })
  handleOf(persistAction).register('canary')
  t.deepEqual(persistor.getState().registry, ['canary'])
})

test('rehydrate method fires with the expected shape', t => {
  const store = mockStore()
  persistStore(store)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })
  handleOf(persistAction).rehydrate('canary', { foo: 'bar' }, null)
  const rehydrateAction = find(actions, { type: REHYDRATE })
  t.deepEqual(rehydrateAction, { type: REHYDRATE, key: 'canary', payload: { foo: 'bar' }, err: null })
})

test('rehydrate method removes provided key from registry', t => {
  const store = mockStore()
  const persistor = persistStore(store)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })

  // register canary
  handleOf(persistAction).register('canary')
  t.deepEqual(persistor.getState().registry, ['canary'])

  // rehydrate canary
  handleOf(persistAction).rehydrate('canary', { foo: 'bar' }, null)
  t.deepEqual(persistor.getState().registry, [])
})

test('rehydrate method removes exactly one of provided key from registry', t => {
  const store = mockStore()
  const persistor = persistStore(store)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })

  // register canary twice
  handleOf(persistAction).register('canary')
  handleOf(persistAction).register('canary')
  t.deepEqual(persistor.getState().registry, ['canary', 'canary'])

  // rehydrate canary
  handleOf(persistAction).rehydrate('canary', { foo: 'bar' }, null)
  t.deepEqual(persistor.getState().registry, ['canary'])
})

test('once registry is cleared for first time, persistor is flagged as bootstrapped', t => {
  const store = mockStore()
  const persistor = persistStore(store)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })

  handleOf(persistAction).register('canary')
  t.false(persistor.getState().bootstrapped)
  handleOf(persistAction).rehydrate('canary', { foo: 'bar' }, null)
  t.true(persistor.getState().bootstrapped)
})

test('once persistor is flagged as bootstrapped, further registry changes do not affect this value', t => {
  const store = mockStore()
  const persistor = persistStore(store)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })

  handleOf(persistAction).register('canary')
  t.false(persistor.getState().bootstrapped)
  handleOf(persistAction).rehydrate('canary', { foo: 'bar' }, null)
  t.true(persistor.getState().bootstrapped)

  // add canary back, registry is updated but bootstrapped remains true
  handleOf(persistAction).register('canary')
  t.deepEqual(persistor.getState().registry, ['canary'])
  t.true(persistor.getState().bootstrapped)
})

test('persistStore calls bootstrapped callback (at most once) if provided', t => {
  const store = mockStore()
  const bootstrappedCb = sinon.spy()  
  persistStore(store, {}, bootstrappedCb)
  const actions = store.getActions()
  const persistAction = find(actions, { type: PERSIST })
  
  handleOf(persistAction).register('canary')
  handleOf(persistAction).rehydrate('canary', { foo: 'bar' }, null)
  t.is(bootstrappedCb.callCount, 1)

  // further rehydrates do not trigger the cb
  handleOf(persistAction).register('canary')
  handleOf(persistAction).rehydrate('canary', { foo: 'bar' }, null)
  t.is(bootstrappedCb.callCount, 1)
})
