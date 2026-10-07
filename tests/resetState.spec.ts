/* eslint-disable @typescript-eslint/no-explicit-any */
// #659: resetting state above persistReducer drops _persist, so writes stop
// and the old state comes back on the next launch. Resetting inside the
// persisted reducer works; the other way gets a development warning.
import test from 'ava'
import { combineReducers, legacy_createStore as createStore } from 'redux'

import { persistReducer, persistStore } from '../src'
import createMemoryStorage from './utils/createMemoryStorage'
import sleep from './utils/sleep'

const user = (state: any = { name: null }, action: any) =>
  action.type === 'login' ? { name: action.name } : state
const appReducer = combineReducers({ user })

const capture = async (run: () => Promise<void>) => {
  const errors: string[] = []
  const original = console.error
  console.error = (...args: any[]) => { errors.push(String(args[0])) }
  try {
    await run()
  } finally {
    console.error = original
  }
  return errors.filter(e => e.includes('lost its _persist key'))
}

const stored = async (storage: any) => JSON.parse(JSON.parse(await storage.getItem('persist:root')).user)

test.serial('resetting inside the persisted reducer keeps saving, without a warning', async t => {
  const storage = createMemoryStorage()
  const errors = await capture(async () => {
    const reducer = persistReducer({ key: 'root', storage }, (state: any, action: any) =>
      appReducer(action.type === 'logout' ? undefined : state, action))
    const store = createStore(reducer)
    const persistor = persistStore(store)
    await sleep(10)
    store.dispatch({ type: 'login', name: 'Ada' })
    store.dispatch({ type: 'logout' })
    await persistor.flush()
    t.deepEqual(await stored(storage), { name: null })
    store.dispatch({ type: 'login', name: 'Grace' })
    await persistor.flush()
    t.deepEqual(await stored(storage), { name: 'Grace' })
  })
  t.deepEqual(errors, [])
})

test.serial('resetting above persistReducer warns once', async t => {
  const errors = await capture(async () => {
    const persisted = persistReducer({ key: 'root', storage: createMemoryStorage() }, appReducer)
    const store = createStore((state: any, action: any) =>
      persisted(action.type === 'logout' ? undefined : state, action))
    persistStore(store)
    await sleep(10)
    store.dispatch({ type: 'logout' })
    store.dispatch({ type: 'login', name: 'Grace' })
    // the warning waits a tick, in case _persist comes back (a devtools recompute)
    await sleep(10)
  })
  t.is(errors.length, 1)
  t.regex(errors[0], /"root" lost its _persist key.*#resetting-state-on-logout/)
})

test.serial('creating more stores from the same reducer does not warn', async t => {
  const errors = await capture(async () => {
    const persisted = persistReducer({ key: 'root', storage: createMemoryStorage() }, appReducer)
    persistStore(createStore(persisted))
    await sleep(10)
    // a second store (another request or test), and one nested in combineReducers
    persistStore(createStore(persisted))
    persistStore(createStore(combineReducers({ app: persisted })))
    await sleep(10)
  })
  t.deepEqual(errors, [])
})
