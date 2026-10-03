/* eslint-disable @typescript-eslint/no-explicit-any */
// Compile-time checks for the public types. `npm test` type-checks this file
// (it is not run by ava); a regression shows up as a compile error.
import { combineReducers, createStore } from 'redux'

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

export { name, badKey, persistor, theme, badCombinedKey, config, transform, rehydrate }
