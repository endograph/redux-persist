/* eslint-disable @typescript-eslint/no-explicit-any */
// Compile-time checks for the public types. `npm test` type-checks this file
// (it is not run by ava); a regression shows up as a compile error.
import { configureStore } from '@reduxjs/toolkit'
import { combineReducers, legacy_createStore as createStore } from 'redux'

import {
  createMigrate,
  createTransform,
  persistCombineReducers,
  persistReducer,
  persistStore,
} from '../../src'
import type {
  MigrationManifest,
  PersistConfig,
  PersistedState,
  Persistor,
  RehydrateAction,
  Transform,
} from '../../src'
import autoMergeLevel1 from '../../src/stateReconciler/autoMergeLevel1'
import autoMergeLevel2 from '../../src/stateReconciler/autoMergeLevel2'
import hardSet from '../../src/stateReconciler/hardSet'
import createMemoryStorage from '../utils/createMemoryStorage'

const storage = createMemoryStorage()

type UserState = { name: string }
const user = (state: UserState = { name: '' }, action: { type: string }): UserState =>
  action.type === 'reset' ? { name: '' } : state
const settings = (state = { theme: 'dark' }, action: { type: string }) =>
  action.type === 'reset' ? { theme: 'dark' } : state
const rootReducer = combineReducers({ user, settings })

// persisted state keeps its type instead of collapsing to any
const store = createStore(persistReducer({ key: 'root', storage }, rootReducer))
const name: string = store.getState().user.name
// @ts-expect-error unknown keys are rejected
const badKey = store.getState().notAKey

// persistStore accepts null options, the documented way to pass only a callback
const persistor: Persistor = persistStore(store, null, () => {})
persistStore(store, { manualPersist: true })

// persistCombineReducers keeps the combined state type
const combined = persistCombineReducers({ key: 'combined', storage }, { user, settings })
const theme: string = combined(undefined, { type: 'init' }).settings.theme
// @ts-expect-error unknown keys are rejected
const badCombinedKey = combined(undefined, { type: 'init' }).notAKey

// typed config with a custom serializer
const config: PersistConfig<ReturnType<typeof rootReducer>> = {
  key: 'typed',
  storage,
  whitelist: ['user'],
  serialize: (data: unknown) => JSON.stringify(data),
  deserialize: (data: string) => JSON.parse(data),
}

// migrations may return a different shape for each version (docs/migrations.md)
const migrations = {
  0: (state: any) => ({ ...state, device: undefined }),
  1: (state: any) => ({ device: state.device }),
  2: async (state: any) => state,
}
const typedMigrations: MigrationManifest = { 3: (state: PersistedState) => state }
persistReducer({ key: 'm', storage, migrate: createMigrate(migrations) }, rootReducer)
persistReducer({ key: 'm2', storage, migrate: createMigrate(typedMigrations, { debug: false }) }, rootReducer)

// createTransform callbacks are typed, and one direction may be null
const transform: Transform<UserState, UserState> = createTransform(
  (inbound: UserState, key) => ({ ...inbound, name: String(key) }),
  null,
  { whitelist: ['user'] }
)

const rehydrate: RehydrateAction | undefined = undefined

// allowlist/denylist are checked against state keys
persistReducer({ key: 'allow', storage, allowlist: ['user'] }, rootReducer)
// @ts-expect-error typos in allowlist are caught
persistReducer({ key: 'allow-typo', storage, allowlist: ['usr'] }, rootReducer)
// @ts-expect-error typos in denylist are caught
persistReducer({ key: 'deny-typo', storage, denylist: ['setings'] }, rootReducer)
const annotatedConfig: PersistConfig<ReturnType<typeof rootReducer>> = { key: 'annotated', storage, denylist: ['user'] }
persistReducer(annotatedConfig, rootReducer)
const constConfig = { key: 'const', storage, allowlist: ['user'] as const }
persistReducer(constConfig, rootReducer)
persistReducer({ key: 'slice', storage, denylist: ['name'] }, user)
persistCombineReducers({ key: 'combined-allow', storage, allowlist: ['settings'] }, { user, settings })

// built-in reconcilers passed inline don't break state inference (#1368)
const hardSetStore = configureStore({ reducer: persistReducer({ key: 'hard', storage, stateReconciler: hardSet }, rootReducer) })
const hardSetName: string = hardSetStore.getState().user.name
const level1Store = configureStore({ reducer: persistReducer({ key: 'level1', storage, stateReconciler: autoMergeLevel1 }, rootReducer) })
const level1Name: string = level1Store.getState().user.name
const level2Store = configureStore({ reducer: persistReducer({ key: 'level2', storage, stateReconciler: autoMergeLevel2 }, rootReducer) })
const level2Name: string = level2Store.getState().user.name
// @ts-expect-error state stays typed with a reconciler
const reconcilerBadKey = level2Store.getState().notAKey

// deprecated whitelist/blacklist still accept any strings, including a separately declared config
const legacyConfig = { key: 'legacy', storage, whitelist: ['user'] }
persistReducer(legacyConfig, rootReducer)
const legacyKeys: string[] = ['user']
persistReducer({ key: 'legacy-keys', storage, blacklist: legacyKeys }, rootReducer)

// RTK: preloadedState doesn't need _persist (#1169, #1459), and state stays typed
const rtkStore = configureStore({
  reducer: persistReducer({ key: 'rtk', storage }, rootReducer),
  preloadedState: { settings: { theme: 'light' } },
})
const rtkName: string = rtkStore.getState().user.name
// @ts-expect-error unknown keys are rejected
const rtkBadKey = rtkStore.getState().notAKey

// RTK + persistCombineReducers: partial preloadedState and narrow action types
type CounterAction = { type: 'inc' } | { type: 'dec' }
const counter = (state = 0, action: CounterAction) => (action.type === 'inc' ? state + 1 : state)
const combinedStore = configureStore({
  reducer: persistCombineReducers({ key: 'combined-rtk', storage }, { counter, settings }),
  preloadedState: { settings: { theme: 'light' } },
})
const count: number = combinedStore.getState().counter

export { name, badKey, persistor, theme, badCombinedKey, config, transform, rehydrate, rtkName, rtkBadKey, count, hardSetName, level1Name, level2Name, reconcilerBadKey }
