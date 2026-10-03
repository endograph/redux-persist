/* eslint-disable @typescript-eslint/no-explicit-any */
// #809: when reading stored state fails or times out, the stored data must not
// be overwritten with initial state.
import test from 'ava'
import { legacy_createStore as createStore } from 'redux'

import { createMigrate, persistReducer, persistStore } from '../src'
import sleep from './utils/sleep'

const STORED = JSON.stringify({
  _persist: JSON.stringify({ version: -1, rehydrated: true }),
  notes: JSON.stringify(['saved note']),
})

const reducer = (state: any = { notes: [] }, action: any) =>
  action.type === 'ADD' ? { ...state, notes: [...state.notes, action.note] } : state

const createStorage = (overrides: Record<string, any> = {}) => {
  const data: Record<string, any> = { 'persist:root': STORED }
  return {
    data,
    getItem: (key: string) => Promise.resolve(data[key]),
    setItem: (key: string, value: any) => { data[key] = value; return Promise.resolve() },
    removeItem: (key: string) => { delete data[key]; return Promise.resolve() },
    getAllKeys: () => Promise.resolve(Object.keys(data)),
    ...overrides,
  }
}

const quietly = async (fn: () => Promise<void>) => {
  const error = console.error
  const warn = console.warn
  console.error = () => {}
  console.warn = () => {}
  try { await fn() } finally { console.error = error; console.warn = warn }
}

const run = async (config: Record<string, any>, waitMs = 50) => {
  const store = createStore(persistReducer({ key: 'root', ...config } as any, reducer))
  const persistor = persistStore(store)
  await sleep(waitMs)
  store.dispatch({ type: 'ADD', note: 'new note' })
  await persistor.flush()
  await sleep(20)
  return { store, persistor }
}

test.serial('a failed read does not overwrite stored data', async t => {
  const storage = createStorage({ getItem: () => Promise.reject(new Error('read failed')) })
  await quietly(() => run({ storage }).then(() => {}))
  t.is(storage.data['persist:root'], STORED)
})

test.serial('unparseable stored data is not overwritten', async t => {
  const storage = createStorage()
  storage.data['persist:root'] = '{not json'
  await quietly(() => run({ storage }).then(() => {}))
  t.is(storage.data['persist:root'], '{not json')
})

test.serial('a failed migration does not overwrite stored data', async t => {
  const storage = createStorage()
  const migrate = createMigrate({ 0: () => { throw new Error('migration bug') } })
  await quietly(() => run({ storage, version: 0, migrate }).then(() => {}))
  t.is(storage.data['persist:root'], STORED)
})

test.serial('a read slower than the timeout does not overwrite stored data, and is applied when it arrives', async t => {
  const storage = createStorage()
  const slowStorage = { ...storage, getItem: (key: string) => sleep(150).then(() => storage.getItem(key)) }
  await quietly(async () => {
    const { store, persistor } = await run({ storage: slowStorage, timeout: 50 }, 80)
    // timed out: the app started with initial state, and nothing was written
    t.is(storage.data['persist:root'], STORED)

    // the read finishes: stored state wins over changes made before it arrived
    await sleep(150)
    t.deepEqual(store.getState().notes, ['saved note'])

    // and writes resume
    store.dispatch({ type: 'ADD', note: 'after load' })
    await persistor.flush()
    t.deepEqual(JSON.parse(JSON.parse(storage.data['persist:root']).notes), ['saved note', 'after load'])
  })
})

test.serial('purge() discards unreadable data and resumes writes', async t => {
  const storage = createStorage()
  storage.data['persist:root'] = '{not json'
  await quietly(async () => {
    const { store, persistor } = await run({ storage })
    t.is(storage.data['persist:root'], '{not json')
    await persistor.purge()
    store.dispatch({ type: 'ADD', note: 'fresh start' })
    await persistor.flush()
  })
  t.deepEqual(JSON.parse(JSON.parse(storage.data['persist:root']).notes), ['new note', 'fresh start'])
})

test.serial('the app still bootstraps when the read fails', async t => {
  const storage = createStorage({ getItem: () => Promise.reject(new Error('read failed')) })
  let bootstrapped = false
  await quietly(async () => {
    const store = createStore(persistReducer({ key: 'root', storage } as any, reducer))
    persistStore(store, null, () => { bootstrapped = true })
    await sleep(20)
  })
  t.true(bootstrapped)
})
