# Migrating to v7

v7 is in development on `master`. The latest release is still v6, and the v6
line is maintained on the `v6` branch. This guide is updated as v7 changes land.

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

## Breaking changes

- **Use the persistor to persist, purge and flush.** `PERSIST`, `PURGE` and
  `FLUSH` actions that weren't dispatched by the persistor are now ignored. If
  you dispatched them yourself, call `persistor.persist()`,
  `persistor.purge()` or `persistor.flush()` instead. This also means replaying
  actions in Redux DevTools no longer throws or purges storage.
- **`REHYDRATE` errors are plain objects.** When reading storage fails,
  `action.err` is `{ name, message }` instead of an `Error` instance, so it can
  be serialized. Code that reads `action.err.message` keeps working; code that
  checks `action.err instanceof Error` needs updating.
