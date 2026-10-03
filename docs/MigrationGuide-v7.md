# Migrating to v7

v7 is in development on `master`; the latest release is still v6.0.0. Fixes
made since 6.0.0 ship in v7 rather than in a v6 release. This guide is updated
as v7 changes land.

## Requirements

- **Redux 5** (or Redux Toolkit 2). The `redux` peer dependency is now `^5.0.0`.

## Stored data

No migration is needed: v7 reads data written by v5 and v6 and writes the same
format, so you can also roll back to v6 without losing data. See
[storage-format.md](storage-format.md).

## Redux Toolkit works without extra setup

redux-persist's actions no longer contain functions, so RTK's serializability
check passes without configuration. Remove the `ignoredActions` setup:

```diff
 export const store = configureStore({
   reducer: persistedReducer,
-  middleware: (getDefaultMiddleware) =>
-    getDefaultMiddleware({
-      serializableCheck: {
-        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
-      },
-    }),
 })
```

Leaving it in place is harmless.

## Shorter import paths

v7 adds an `exports` map with ES module and CommonJS builds, and shorter paths:

| v7 | Still works |
|---|---|
| `redux-persist/storage` | `redux-persist/lib/storage` |
| `redux-persist/storage/session` | `redux-persist/lib/storage/session` |
| `redux-persist/storage/createWebStorage` | `redux-persist/lib/storage/createWebStorage` |
| `redux-persist/react` | `redux-persist/integration/react` |
| `redux-persist/stateReconciler/autoMergeLevel2` | `redux-persist/lib/stateReconciler/autoMergeLevel2` |

Every `redux-persist/lib/...` and `redux-persist/es/...` path from v6 keeps
working. In native Node ES modules (not through a bundler), prefer the short
paths: `import storage from 'redux-persist/lib/storage'` there gives you the
CommonJS module, with the storage at `.default`, as in v6.

## Server rendering (Next.js and others)

`redux-persist/lib/storage` and `redux-persist/lib/storage/session` now work on
the server without the "failed to create sync storage" error (#1208, #1464).
Without a browser `window` they store nothing, silently, and stored state is
loaded in the browser as usual. You can remove the common workaround:

```diff
-import createWebStorage from 'redux-persist/lib/storage/createWebStorage'
-
-const createNoopStorage = () => ({
-  getItem: () => Promise.resolve(null),
-  setItem: (_key, value) => Promise.resolve(value),
-  removeItem: () => Promise.resolve(),
-})
-
-const storage = typeof window === 'undefined' ? createNoopStorage() : createWebStorage('local')
+import storage from 'redux-persist/lib/storage'
```

On the server, a global `localStorage` (Node 25+) is never used, since it
would be shared by every request. In the browser, if storage is blocked (for
example by privacy settings) a warning is logged in development and state
isn't persisted, as before. Storage is now looked up on first use rather than
when the module is imported.

## `allowlist` and `denylist`

`whitelist` and `blacklist` are now `allowlist` and `denylist`. The old names
keep working (in `persistReducer`, `persistCombineReducers` and
`createTransform`) and are marked deprecated, so you can switch at your own
pace. The stored data is the same either way.

The new names are checked against your state's keys, so typos are caught:

```ts
persistReducer({ key: 'root', storage, allowlist: ['usr'] }, rootReducer)
// error: Type '"usr"' is not assignable to type '"settings" | "user"'. Did you mean '"user"'?
```

If you declare the config separately, TypeScript widens the array to
`string[]`. Annotate the config, or use `as const`:

```ts
const persistConfig: PersistConfig<RootState> = { key: 'root', storage, allowlist: ['user'] }
// or
const persistConfig = { key: 'root', storage, allowlist: ['user'] as const }
```

If both an old and a new name are set, the new one is used and a warning is
logged in development.

## Breaking changes

- **Use the persistor to persist, purge and flush.** `PERSIST`, `PURGE` and
  `FLUSH` actions that weren't dispatched by the persistor are now ignored. If
  you dispatched them yourself, call `persistor.persist()`,
  `persistor.purge()` or `persistor.flush()` instead. This also means replaying
  actions in Redux DevTools no longer throws or purges storage.
- **Stored data is never overwritten after a failed read.** If reading stored
  state fails or a migration throws, writes for that key stay off for the
  session instead of replacing the stored data with initial state (#809). Call
  `persistor.purge()` to discard data you know is unreadable. If the read times
  out, the stored state is applied when it arrives (with a second `REHYDRATE`)
  instead of being dropped, and writes resume then. See
  [When stored state can't be read](api.md#when-stored-state-cant-be-read).
- **`persistCombineReducers` is generic over the reducers map**, like Redux 5's
  `combineReducers`. If you passed a type argument
  (`persistCombineReducers<RootState>(...)`), remove it; the state type is
  inferred from the reducers.
- **Persistence state is per store.** When one persisted reducer is shared
  by several stores (a store per server request or per test), pausing,
  purging or a failed read in one store no longer affects the others. A store
  created with preloaded state that already has a `_persist` key (for example
  state rendered on the server) now loads stored state and bootstraps instead
  of waiting forever. After `replaceReducer` with a new persisted reducer (hot
  reloading), state keeps being saved.
- **`REHYDRATE` errors are plain objects.** When reading storage fails,
  `action.err` is `{ name, message }` instead of an `Error` instance, so it can
  be serialized. Code that reads `action.err.message` keeps working; code that
  checks `action.err instanceof Error` needs updating.
