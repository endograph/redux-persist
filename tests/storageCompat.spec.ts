/* eslint-disable @typescript-eslint/no-explicit-any */
// Storage compatibility contract (docs/storage-format.md): data written by
// published v5 and v6 must be read correctly by the current code, and the
// current code must write the same bytes. Fixtures are recorded from the
// published packages by scripts/storage-fixtures/generate.js.
import test from 'ava'
import { combineReducers, legacy_createStore as createStore } from 'redux'

import { createMigrate, persistReducer, persistStore } from '../src'
import fixtureFile from './fixtures/storage-v5-v6.json'

interface Fixture {
  version: string
  name: string
  config: any
  state: any
  storage: Record<string, any>
}
const fixtures = fixtureFile.fixtures as Fixture[]

const memoryStorage = (initial: Record<string, any> = {}) => {
  const data: Record<string, any> = { ...initial }
  return {
    data,
    getItem: (key: string) => Promise.resolve(data[key]),
    setItem: (key: string, value: any) => { data[key] = value; return Promise.resolve() },
    removeItem: (key: string) => { delete data[key]; return Promise.resolve() },
    getAllKeys: () => Promise.resolve(Object.keys(data)),
  }
}

const settable = (type: string) => (state: any = {}, action: any) =>
  action.type === type ? action.state : state

const bootstrap = (store: any) =>
  new Promise<any>(resolve => {
    const persistor = persistStore(store, null, () => resolve(persistor))
  })

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const withoutPersist = ({ _persist, ...rest }: any) => rest

// keys of the fixture state that the config persists
const persistedKeys = (fixture: Fixture) =>
  Object.keys(fixture.state).filter(key => {
    const { whitelist, blacklist } = fixture.config
    if (whitelist) return whitelist.includes(key)
    if (blacklist) return !blacklist.includes(key)
    return true
  })

const flat = fixtures.filter(f => f.name !== 'nested' && f.name !== 'versioned')

for (const fixture of flat) {
  test(`reads ${fixture.name} written by v${fixture.version}`, async t => {
    const storage = memoryStorage(fixture.storage)
    const store = createStore(persistReducer({ ...fixture.config, storage }, settable('SET')))
    await bootstrap(store)
    const expected = Object.fromEntries(persistedKeys(fixture).map(key => [key, fixture.state[key]]))
    t.deepEqual(withoutPersist(store.getState()), expected)
  })

  test(`writes ${fixture.name} exactly like v${fixture.version}`, async t => {
    const storage = memoryStorage()
    const store = createStore(persistReducer({ ...fixture.config, storage }, settable('SET')))
    const persistor = await bootstrap(store)
    store.dispatch({ type: 'SET', state: fixture.state })
    await persistor.flush()
    t.deepEqual(storage.data, fixture.storage)
  })
}

for (const fixture of fixtures.filter(f => f.name === 'versioned')) {
  test(`migrates versioned state written by v${fixture.version}`, async t => {
    const storage = memoryStorage(fixture.storage)
    const migrations = {
      2: (state: any) => ({
        ...state,
        profile: { fullName: `${state.profile.firstName} ${state.profile.lastName}` },
      }),
    }
    const store = createStore(
      persistReducer({ key: 'root', storage, version: 2, migrate: createMigrate(migrations) }, settable('SET'))
    )
    await bootstrap(store)
    t.deepEqual(withoutPersist(store.getState()), { profile: { fullName: 'Ada Lovelace' } })
    t.is(store.getState()._persist.version, 2)
  })

  test(`writes versioned ${fixture.name} exactly like v${fixture.version}`, async t => {
    const storage = memoryStorage()
    const store = createStore(persistReducer({ ...fixture.config, storage }, settable('SET')))
    const persistor = await bootstrap(store)
    store.dispatch({ type: 'SET', state: fixture.state })
    await persistor.flush()
    t.deepEqual(storage.data, fixture.storage)
  })
}

const nestedStore = (storage: ReturnType<typeof memoryStorage>, config: any) =>
  createStore(
    persistReducer(
      { ...config.root, storage },
      combineReducers({
        user: persistReducer({ ...config.user, storage }, settable('SET_USER')),
        settings: settable('SET_SETTINGS'),
      })
    )
  )

for (const fixture of fixtures.filter(f => f.name === 'nested')) {
  test(`reads nested persists written by v${fixture.version}`, async t => {
    const store = nestedStore(memoryStorage(fixture.storage), fixture.config)
    await bootstrap(store)
    const state = store.getState()
    t.deepEqual(withoutPersist(state.user), { name: 'Ada' })
    t.deepEqual(state.settings, { theme: 'dark' })
  })

  test(`writes nested persists exactly like v${fixture.version}`, async t => {
    const storage = memoryStorage()
    const store = nestedStore(storage, fixture.config)
    const persistor = await bootstrap(store)
    store.dispatch({ type: 'SET_USER', state: fixture.state.user })
    store.dispatch({ type: 'SET_SETTINGS', state: fixture.state.settings })
    await persistor.flush()
    t.deepEqual(storage.data, fixture.storage)
  })
}
