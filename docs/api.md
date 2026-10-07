# Redux Persist API
---
## Imports

| Import | What |
|---|---|
| `redux-persist` | `persistReducer`, `persistStore`, `persistCombineReducers`, `createMigrate`, `createTransform`, `getStoredState`, `purgeStoredState`, `createPersistoid`, action types and all types |
| `redux-persist/storage` | localStorage storage engine (noop on the server) |
| `redux-persist/storage/session` | sessionStorage storage engine |
| `redux-persist/storage/createWebStorage` | `createWebStorage('local' \| 'session')` |
| `redux-persist/react` | `PersistGate`, `useRehydrated` |
| `redux-persist/stateReconciler/hardSet`, `autoMergeLevel1`, `autoMergeLevel2` | state reconcilers |

The v6 paths (`redux-persist/lib/...`, `redux-persist/es/...`,
`redux-persist/integration/react`) keep working.

## Quick reference

### `persistReducer(config, reducer)`
  - arguments
    - [**config**](#type-persistconfig) *object*
      - required config: `key, storage`
      - notable other config: `allowlist, denylist, version, migrate, stateReconciler, throttle, debug`
    - **reducer** *function*
      - any reducer whose state is a plain object, typically the top level reducer returned by `combineReducers`. persistReducer adds a `_persist` key to that object, so state that is an array or a primitive needs wrapping (for example `{ items: [] }`); in development this is reported as an error
  - returns an enhanced reducer

### `persistStore(store, [config, callback])`
  - arguments
    - **store** *redux store* The store to be persisted.
    - **config** *object* (typically null)
      - If you want to avoid that the persistence starts immediately after calling `persistStore`, set the option manualPersist. Example: `{ manualPersist: true }` Persistence can then be started at any point with `persistor.persist()`. You usually want to do this if your storage is not ready when the `persistStore` call is made.
    - **callback** *function* will be called after rehydration is finished.
  - returns **persistor** object

### `persistor object`
  - the persistor object is returned by persistStore with the following methods:
    - `.purge()`
      - purges state from disk and returns a promise
    - `.flush()`
      - immediately writes all pending state to disk and returns a promise
    - `.pause()`
      - pauses persistence
    - `.persist()`
      - resumes persistence
    - `.getState()`
      - `{ registry, bootstrapped }`; `bootstrapped` is true once stored state has loaded
    - `.subscribe(listener)`
      - calls `listener` when the persistor's state changes; returns an unsubscribe function

---
## Standard API
- [persistReducer](#persistreducerconfig-reducer)([config](#type-persistconfig), reducer)
- [persistStore](#persiststorestore-config-callback)(store)
- [createMigrate](#createmigratemigrations-config)([migrations](#type-migrationmanifest))
### `persistReducer(config, reducer)`

```js
persistReducer(
  config: PersistConfig,
  reducer: Reducer,
): Reducer
```

Where Reducer is any reducer `(state, action) => state` and PersistConfig is [defined below](#type-persistconfig)

### `persistStore(store, config, callback)`
```js
persistStore(
  store: Store,
  config?: { enhancer?: Function, manualPersist?: boolean } | null,
  callback?: () => {}
): Persistor
```

Where Persistor is [defined below](#type-persistor)

### `createMigrate(migrations, config)`
```js
createMigrate(
  migrations: MigrationManifest,
  config?: { debug: boolean }
)
```

### `type Persistor`
```js
{
  purge: () => Promise<void>,
  flush: () => Promise<void>,
  pause: () => void,
  persist: () => void,
  getState: () => { registry: Array<string>, bootstrapped: boolean },
  subscribe: (listener: () => void) => () => void,
}
```

The Persistor is a redux store unto itself, plus
1. the `purge()` method for clearing out stored state.
2. the `flush()` method for flushing all pending state serialization and immediately write to disk

`purge()` only clears the stored data; the state in your store is unchanged. To reset the state too (for example on logout), see [Resetting state on logout](../README.md#resetting-state-on-logout).

#### Saving before the app closes
State changes are written asynchronously (after `throttle` ms, or on the next tick by default), so a change made right before a browser tab closes or a React Native app is backgrounded may not be saved. Call `flush()` from those events to write pending changes immediately:

```js
// web
window.addEventListener('beforeunload', () => {
  persistor.flush()
})

// React Native
import { AppState } from 'react-native'

AppState.addEventListener('change', (state) => {
  if (state === 'background') persistor.flush()
})
```

With the built-in `localStorage` and `sessionStorage` engines, `flush()` writes synchronously. Async engines such as AsyncStorage start the write immediately.

On React Native, timers may not run while the app is in the background, for example in a [Headless JS](https://reactnative.dev/docs/headless-js-android) task, so a write can wait until the app is in the foreground again. In background work, `await persistor.flush()` after dispatching to save right away.

### `type PersistConfig`
```js
{
  key: string, // the key for the persist
  storage: Object, // the storage adapter, following the AsyncStorage api
  version?: number, // the state version as an integer (defaults to -1)
  allowlist?: Array<keyof State>, // only persist these keys
  denylist?: Array<keyof State>, // do not persist these keys
  whitelist?: Array<string>, // deprecated: older name for allowlist
  blacklist?: Array<string>, // deprecated: older name for denylist
  migrate?: (Object, number) => Promise<Object>,
  transforms?: Array<Transform>,
  throttle?: number, // ms to throttle state writes
  keyPrefix?: string, // will be prefixed to the storage key
  debug?: boolean, // true -> verbose logs
  stateReconciler?: false | StateReconciler, // false -> do not automatically reconcile state
  serialize?: boolean | Function, // false -> store values as is; or a custom serializer (defaults to JSON.stringify)
  deserialize?: boolean | Function, // false -> read values as is; or a custom deserializer (defaults to JSON.parse)
  writeFailHandler?: Function, // will be called if the storage engine fails during setItem()
  timeout?: number, // ms to wait for stored state before starting without it, and for a replaced reducer's in-flight write before writing over it (defaults to 5000, 0 to wait forever)
}
```

Persisting state involves calling setItem() on the storage engine. By default, this will fail silently if the storage/quota is exhausted.  
Provide a writeFailHandler(error) function to be notified if this occurs.

#### When stored state can't be read
If reading stored state fails (a storage error, data that can't be parsed, or a migration that throws), the app still starts: `REHYDRATE` is dispatched with `err` set and no payload. Writes for that key then stay off for the rest of the session, so the stored data isn't replaced with initial state. Call `persistor.purge()` to discard the unreadable data and resume writing, for example after inspecting `err` in a `REHYDRATE` handler.

If one of your reducers throws while handling `REHYDRATE`, the app still starts, the stored state isn't applied, writes for that key stay off for the session so the stored data isn't overwritten, and the error is logged in development.

If reading takes longer than `timeout`, the app starts the same way, with `err` describing the timeout, and writes stay off. When the read finishes, the stored state is applied with a second `REHYDRATE` and writes resume. The stored state replaces any changes made to the same keys in the meantime.

### `type MigrationManifest`
```js
{
  [number]: (State) => State | Promise<State>
}
```
Where the keys are state version numbers and the values are migration functions to modify state. Migrations may be async; they run in version order.

### `REHYDRATE` action
```js
{
  type: 'persist/REHYDRATE',
  key: string, // the persistReducer's config key
  payload?: State, // the stored state, if any
  err?: { name: string, message: string }, // set when reading stored state failed or timed out
}
```

---
## Expanded API
The following methods are used internally by the standard api. They can be accessed directly if more control is needed.
### `getStoredState(config)`
```js
getStoredState(
  config: PersistConfig
): Promise<State>
```

Returns a promise (if Promise global is defined) of restored state.

### `createPersistoid(config)`
```js
createPersistoid(
  config
): Persistoid
```
Where Persistoid is [defined below](#type-persistoid).

### `type Persistoid`
```js
{
  update: (State) => void
}
```

### `type PersistorConfig`
```js
{
  enhancer: Function
}
```
Where enhancer will be sent verbatim to the redux createStore call used to create the persistor store. This can be useful for example to enable redux devtools on the persistor store.

### `type StateReconciler`
```js
(
  inboundState: State,
  originalState: State,
  reducedState: State,
) => State
```
A function which reconciles:
- **inboundState**: the state being rehydrated from storage
- **originalState**: the state before the REHYDRATE action
- **reducedState**: the store state *after* the REHYDRATE action but *before* the reconcilliation
into final "rehydrated" state.
