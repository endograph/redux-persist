/* eslint-disable @typescript-eslint/no-explicit-any */
// #1112: replacing persistReducer with one that saves under another key (for
// example a per-user keyPrefix) keeps the current state and writes it there,
// over what was stored. That's worth a development warning.
import test from 'ava'
import { legacy_createStore as createStore } from 'redux'

import { persistReducer, persistStore } from '../src'
import createMemoryStorage from './utils/createMemoryStorage'
import sleep from './utils/sleep'

const reducer = (state: any = { count: 0 }, action: any) =>
  action.type === 'INC' ? { ...state, count: state.count + 1 } : state

const captureErrors = async (run: () => Promise<void>) => {
  const errors: string[] = []
  const original = console.error
  console.error = (...args: any[]) => { errors.push(String(args[0])) }
  try {
    await run()
  } finally {
    console.error = original
  }
  return errors.filter(e => e.includes('was replaced by one that saves to'))
}

test.serial('replacing it with one that saves under another key warns', async t => {
  const errors = await captureErrors(async () => {
    const storage = createMemoryStorage()
    const store = createStore(persistReducer({ key: 'root', keyPrefix: 'userA:', storage }, reducer))
    persistStore(store)
    await sleep(10)
    store.replaceReducer(persistReducer({ key: 'root', keyPrefix: 'userB:', storage }, reducer))
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })
  })
  t.is(errors.length, 1)
  t.regex(errors[0], /saves to "userB:root" instead of "userA:root".*create a new store and persistor/)
})

test.serial('replacing it with the same key (hot reloading) does not warn', async t => {
  const errors = await captureErrors(async () => {
    const storage = createMemoryStorage()
    const store = createStore(persistReducer({ key: 'root', storage }, reducer))
    persistStore(store)
    await sleep(10)
    store.replaceReducer(persistReducer({ key: 'root', storage }, reducer))
    store.dispatch({ type: 'INC' })
  })
  t.deepEqual(errors, [])
})
