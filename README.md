<p align="center">
  <img src="https://raw.githubusercontent.com/endograph/redux-persist/master/favicon.svg" alt="redux-persist" width="120" />
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="docs/api.md">API</a> ·
  <a href="docs/storage-engines.md">Storage engines</a> ·
  <a href="https://www.npmjs.com/package/redux-persist">npm</a>
</p>

# redux-persist

[![CI](https://img.shields.io/github/actions/workflow/status/endograph/redux-persist/ci.yml?branch=master)](https://github.com/endograph/redux-persist/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/redux-persist)](https://www.npmjs.com/package/redux-persist)
[![npm next](https://img.shields.io/npm/v/redux-persist/next?label=next)](https://www.npmjs.com/package/redux-persist?activeTab=versions)
[![downloads](https://img.shields.io/npm/dm/redux-persist)](https://www.npmjs.com/package/redux-persist)
[![license](https://img.shields.io/npm/l/redux-persist)](LICENSE)

Persist and rehydrate a redux store. Your state is saved to storage as it
changes and restored into the store when your app starts.

> Hey all! redux-persist is maintained again, and **v7 is in beta**
> (`npm install redux-persist@next`): Redux Toolkit 2 support with no extra
> setup, a fix for stored data getting wiped
> ([#809](https://github.com/endograph/redux-persist/issues/809)), and lots
> more. Please try it and tell us how it goes in
> [#1486](https://github.com/endograph/redux-persist/issues/1486).
>
> These docs are for v7, which needs Redux 5 or Redux Toolkit 2. Upgrading
> from 6? Read the [migration guide](docs/MigrationGuide-v7.md); your stored
> data carries over as is. For 6.x, see the
> [v6 docs](https://github.com/endograph/redux-persist/tree/v6#readme).

- **Drop-in.** Wrap your root reducer with `persistReducer` and call
  `persistStore`. Nothing else in your app changes, and Redux Toolkit needs no
  extra setup.
- **Any storage.** localStorage and sessionStorage ship in the box;
  AsyncStorage, IndexedDB, the filesystem and more plug in —
  [storage engines](docs/storage-engines.md).
- **You choose what's saved.** Allow or block keys, nest persisted reducers
  for finer control, and transform state on the way in and out.
- **Versioned.** Migrations upgrade stored state when its shape changes —
  [how migrations work](docs/migrations.md).

## Quickstart

```sh
npm install redux-persist
```

Wrap your root reducer and create a persistor alongside the store:

```ts
// app/store.ts
import { configureStore, combineReducers } from '@reduxjs/toolkit'
import { persistStore, persistReducer } from 'redux-persist'
import storage from 'redux-persist/storage' // localStorage on the web
import userReducer from './features/user/userSlice'
import configReducer from './features/config/configSlice'

const rootReducer = combineReducers({
  user: userReducer,
  config: configReducer
})

const persistConfig = {
  key: 'root',
  version: 1,
  storage,
}

const persistedReducer = persistReducer(persistConfig, rootReducer)

export const store = configureStore({
  reducer: persistedReducer,
})

export const persistor = persistStore(store)
```

If you use React, wrap your root component in
[`PersistGate`](docs/PersistGate.md). It holds off rendering until the stored
state has been loaded back into redux. `loading` can be `null` or any React
element, e.g. `loading={<Loading />}`.

```js
import { PersistGate } from 'redux-persist/react'
import { store, persistor } from './app/store'

// ... normal setup, import components etc.

const App = () => {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <RootComponent />
      </PersistGate>
    </Provider>
  );
};
```

If you'd rather not gate rendering, `useRehydrated(persistor)` from
`redux-persist/react` returns whether stored state has loaded.

Every app has to decide how many levels of stored state to merge into its
initial state. The default is one level; read
[state reconcilers](docs/state-reconciler.md) before you ship.

### React Native

Pass your storage engine explicitly:

```js
import AsyncStorage from '@react-native-async-storage/async-storage'

const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
}
```

### Server rendering

`redux-persist/storage` works during server rendering (Next.js and others): on
the server it stores nothing, and stored state is loaded in the browser.

### Choosing what's saved

`denylist` and `allowlist` pick top-level keys:

```ts
persistReducer({ key: 'root', storage, denylist: ['navigation'] }, rootReducer) // navigation will not be persisted

persistReducer({ key: 'root', storage, allowlist: ['navigation'] }, rootReducer) // only navigation will be persisted
```

They're checked against your state's keys, so a typo is a type error. If you
declare the config separately, annotate it with `PersistConfig<RootState>` or
use `as const` on the array. The older names `blacklist` and `whitelist` still
work.

To go deeper than one level, use [nested persists](docs/nested-persists.md).

## Learn more

- [API](docs/api.md) — `persistReducer`, `persistStore`, the persistor, and config types
- [PersistGate](docs/PersistGate.md) — delaying render until rehydration finishes
- [State reconcilers](docs/state-reconciler.md) — how stored state merges with initial state
- [Nested persists](docs/nested-persists.md) — per-branch storage, code splitting, deep filtering
- [Migrations](docs/migrations.md) — upgrading stored state between versions
- [Transforms](docs/transforms.md) — customizing what's serialized, and community transforms
- [Storage engines](docs/storage-engines.md) — built-in and community storage backends
- [Hot module replacement](docs/hot-module-replacement.md)
- [Migrating from v6 to v7](docs/MigrationGuide-v7.md)
- [Storage format](docs/storage-format.md) — what's stored, and the compatibility promise
- [Migrating from v4 to v5](docs/MigrationGuide-v5.md)

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md),
especially before changing anything that touches stored data. Feedback on the
v7 beta goes in [#1486](https://github.com/endograph/redux-persist/issues/1486).
