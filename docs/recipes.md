# Recipes

- [Loading part of the state later](#loading-part-of-the-state-later)
- [Separate state for each user](#separate-state-for-each-user)
- [Syncing tabs](#syncing-tabs)
- [Knowing when state was saved](#knowing-when-state-was-saved)
- [Encryption and other async work](#encryption-and-other-async-work)

## Loading part of the state later
A persisted reducer that's added after the store is created (code splitting)
loads its stored state the next time `persistor.persist()` runs. Give it its
own `persistReducer`, and deny its key in the root config so it isn't stored
twice:

```js
const rootConfig = { key: 'root', storage, denylist: ['notifications'] }
const createRootReducer = (asyncReducers = {}) =>
  persistReducer(rootConfig, combineReducers({ ...staticReducers, ...asyncReducers }))

const store = configureStore({ reducer: createRootReducer() })
const persistor = persistStore(store)

// later, when the notifications screen opens
store.replaceReducer(
  createRootReducer({
    notifications: persistReducer({ key: 'notifications', storage }, notificationsReducer),
  })
)
persistor.persist()
```

Only the new key is read; everything else carries on as it was. With Redux
Toolkit's `combineSlices`, `inject` the persisted reducer instead of calling
`replaceReducer`, then call `persistor.persist()`.

To know when it has loaded, check its `_persist.rehydrated`, for example
`useSelector(state => state.notifications?._persist?.rehydrated)`.

## Separate state for each user
A store saves under its persist key. To keep each user's state apart, create
a store and persistor for each user, with the user in the key, and switch to a
new one when the user changes:

```js
function createUserStore(userId) {
  const store = configureStore({
    reducer: persistReducer({ key: `user:${userId}`, storage }, rootReducer),
  })
  return { store, persistor: persistStore(store) }
}

// when the user changes
await current.persistor.flush() // save the previous user's last changes
current = createUserStore(nextUserId)
```

Give the providers a `key`, so the app remounts with the new store:

```jsx
<Provider store={current.store} key={userId}>
  <PersistGate persistor={current.persistor} loading={null}>
    <App />
  </PersistGate>
</Provider>
```

To remove a user's data from the device when they log out,
`await persistor.purge()` before switching.

Don't switch users by passing a `persistReducer` with another key or
storage engine to `replaceReducer`: the store keeps its state, so the current
user's state gets saved over what's stored for the new user, and nothing is
loaded from it. redux-persist logs an error in development when the key
changes.

## Syncing tabs
Every tab has its own store, and they all save to the same `localStorage`
key, so whichever tab saves last wins. To keep tabs in step, only let the
visible tab save, and have a tab load what's stored when it becomes visible:

```js
import { getStoredState, REHYDRATE } from 'redux-persist'

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') {
    persistor.pause()
    persistor.flush()
  } else {
    try {
      const payload = await getStoredState(persistConfig)
      store.dispatch({ type: REHYDRATE, key: persistConfig.key, payload })
    } finally {
      persistor.persist()
    }
  }
})
```

`REHYDRATE` merges the stored state in with your
[state reconciler](state-reconciler.md), just like at startup. With
[nested persists](nested-persists.md), load and dispatch each config's state
the same way. If your config has `migrate`, run the stored state through it
before dispatching it: `await persistConfig.migrate(payload, persistConfig.version)`.

Changes a tab makes while hidden aren't saved, and they're replaced by the
stored state when it becomes visible again. Two windows side by side are both
visible, so each keeps saving its own changes until one of them is hidden.

## Knowing when state was saved
`persistor.flush()` writes pending changes right away and resolves once
they're saved:

```js
await persistor.flush()
```

To run code after every save, wrap your storage engine's `setItem`:

```js
const storageWithCallback = {
  getItem: key => storage.getItem(key),
  setItem: async (key, value) => {
    await storage.setItem(key, value)
    onSaved(key)
  },
  removeItem: key => storage.removeItem(key),
}
```

## Encryption and other async work
[Transforms](transforms.md) run synchronously. For async work on what's
stored, such as encrypting it with the Web Crypto API, wrap your storage
engine, whose calls can be async:

```js
const encryptedStorage = {
  getItem: async key => {
    const value = await storage.getItem(key)
    return value == null ? value : decrypt(value)
  },
  setItem: async (key, value) => storage.setItem(key, await encrypt(value)),
  removeItem: key => storage.removeItem(key),
}
```

`encrypt` and `decrypt` are your own async functions from string to string.
This changes what's stored, so if you add it to an app that already saved
state, have `decrypt` return unencrypted data as it is. Writes then finish
asynchronously, so `flush()` in a `beforeunload` handler may not complete
before the page closes.

To keep a secret such as an auth token out of the main storage altogether,
give its slice a [nested](nested-persists.md) `persistReducer` with a secure
storage engine (see [storage engines](storage-engines.md)), and deny it in the
root config.
