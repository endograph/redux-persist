# Redux Persist
Persist and rehydrate a redux store.

[![build status](https://img.shields.io/github/actions/workflow/status/endograph/redux-persist/ci.yml?branch=master&style=flat-square)](https://github.com/endograph/redux-persist/actions/workflows/ci.yml) [![npm version](https://img.shields.io/npm/v/redux-persist.svg?style=flat-square)](https://www.npmjs.com/package/redux-persist) [![npm downloads](https://img.shields.io/npm/dm/redux-persist.svg?style=flat-square)](https://www.npmjs.com/package/redux-persist)

Hey all! Sorry for the silence. I am back and redux persist will be maintained again. Starting a triage pass now, there's a lot to cover 🫠 ([#1486](https://github.com/endograph/redux-persist/issues/1486))

## Quickstart
`npm install redux-persist`

Usage Examples:
1. [Basic Usage](#basic-usage)
2. [Nested Persists](#nested-persists)
3. [Hot Module Replacement](./docs/hot-module-replacement.md)
4. Code Splitting [coming soon]

#### Basic Usage
Basic usage involves adding `persistReducer` and `persistStore` to your setup. **IMPORTANT** Every app needs to decide how many levels of state they want to "merge". The default is 1 level. Please read through the [state reconciler docs](#state-reconciler) for more information.

```ts
// app/store.ts
import { configureStore, combineReducers } from '@reduxjs/toolkit'
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist'
import storage from 'redux-persist/lib/storage'
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
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
})

export const persistor = persistStore(store)
```

If you are using react, wrap your root component with [PersistGate](./docs/PersistGate.md). This delays the rendering of your app's UI until your persisted state has been retrieved and saved to redux. **NOTE** the `PersistGate` loading prop can be null, or any react instance, e.g. `loading={<Loading />}`

```js
import { PersistGate } from 'redux-persist/integration/react'
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

## API
[Full API](./docs/api.md)

#### `persistReducer(config, reducer)`
  - arguments
    - [**config**](https://github.com/rt2zz/redux-persist/blob/master/src/types.js#L13-L27) *object*
      - required config: `key, storage`
      - notable other config: `whitelist, blacklist, version, stateReconciler, debug`
    - **reducer** *function*
      - any reducer will work, typically this would be the top level reducer returned by `combineReducers`
  - returns an enhanced reducer

#### `persistStore(store, [config, callback])`
  - arguments
    - **store** *redux store* The store to be persisted.
    - **config** *object* (typically null)
      - If you want to avoid that the persistence starts immediately after calling `persistStore`, set the option manualPersist. Example: `{ manualPersist: true }` Persistence can then be started at any point with `persistor.persist()`. You usually want to do this if your storage is not ready when the `persistStore` call is made.
    - **callback** *function* will be called after rehydration is finished.
  - returns **persistor** object

#### `persistor object`
  - the persistor object is returned by persistStore with the following methods:
    - `.purge()`
      - purges state from disk and returns a promise
    - `.flush()`
      - immediately writes all pending state to disk and returns a promise
    - `.pause()`
      - pauses persistence
    - `.persist()`
      - resumes persistence

## State Reconciler
State reconcilers define how incoming state is merged in with initial state. It is critical to choose the right state reconciler for your state. There are three options that ship out of the box, let's look at how each operates:

1. **hardSet** (`import hardSet from 'redux-persist/lib/stateReconciler/hardSet'`)
This will hard set incoming state. This can be desirable in some cases where persistReducer is nested deeper in your reducer tree, or if you do not rely on initialState in your reducer.
   - **incoming state**: `{ foo: incomingFoo }`
   - **initial state**: `{ foo: initialFoo, bar: initialBar }`
   - **reconciled state**: `{ foo: incomingFoo }` // note bar has been dropped
2. **autoMergeLevel1** (default)
This will auto merge one level deep. Auto merge means if the some piece of substate was modified by your reducer during the REHYDRATE action, it will skip this piece of state. Level 1 means it will shallow merge 1 level deep.
   - **incoming state**: `{ foo: incomingFoo }`
   - **initial state**: `{ foo: initialFoo, bar: initialBar }`
   - **reconciled state**: `{ foo: incomingFoo, bar: initialBar }` // note incomingFoo overwrites initialFoo
3. **autoMergeLevel2** (`import autoMergeLevel2 from 'redux-persist/lib/stateReconciler/autoMergeLevel2'`)
This acts just like autoMergeLevel1, except it shallow merges two levels
   - **incoming state**: `{ foo: incomingFoo }`
   - **initial state**: `{ foo: initialFoo, bar: initialBar }`
   - **reconciled state**: `{ foo: mergedFoo, bar: initialBar }` // note: initialFoo and incomingFoo are shallow merged

#### Example
```js
import hardSet from 'redux-persist/lib/stateReconciler/hardSet'

const persistConfig = {
  key: 'root',
  storage,
  stateReconciler: hardSet,
}
```

## React Integration
Redux persist ships with react integration as a convenience. The `PersistGate` component is the recommended way to delay rendering until persistence is complete. It works in one of two modes:
1. `loading` prop: The provided loading value will be rendered until persistence is complete at which point children will be rendered.
2. function children: The function will be invoked with a single `bootstrapped` argument. When bootstrapped is true, persistence is complete and it is safe to render the full app. This can be useful for adding transition animations.

## Blacklist & Whitelist
By Example:
```js
// BLACKLIST
const persistConfig = {
  key: 'root',
  storage: storage,
  blacklist: ['navigation'] // navigation will not be persisted
};

// WHITELIST
const persistConfig = {
  key: 'root',
  storage: storage,
  whitelist: ['navigation'] // only navigation will be persisted
};
```

## Nested Persists
Nested persist can be useful for including different storage adapters, code splitting, or deep filtering. For example while blacklist and whitelist only work one level deep, but we can use a nested persist to blacklist a deeper value:
```js
import { combineReducers } from 'redux'
import { persistReducer } from 'redux-persist'
import storage from 'redux-persist/lib/storage'

import { authReducer, otherReducer } from './reducers'

const rootPersistConfig = {
  key: 'root',
  storage: storage,
  blacklist: ['auth']
}

const authPersistConfig = {
  key: 'auth',
  storage: storage,
  blacklist: ['somethingTemporary']
}

const rootReducer = combineReducers({
  auth: persistReducer(authPersistConfig, authReducer),
  other: otherReducer,
})

export default persistReducer(rootPersistConfig, rootReducer)
```

## Migrations
`persistReducer` has a general purpose "migrate" config which will be called after getting stored state but before actually reconciling with the reducer. It can be any function which takes state as an argument and returns a promise to return a new state object.

Redux Persist ships with `createMigrate`, which helps create a synchronous migration for moving from any version of stored state to the current state version. [[Additional information]](./docs/migrations.md)

## Transforms
Transforms allow you to customize the state object that gets persisted and rehydrated.

There are several libraries that tackle some common implementations for transforms.
- [immutable](https://github.com/rt2zz/redux-persist-transform-immutable) - support immutable reducers
- [seamless-immutable](https://github.com/hilkeheremans/redux-persist-seamless-immutable) - support seamless-immutable reducers
- [compress](https://github.com/rt2zz/redux-persist-transform-compress) - compress your serialized state with lz-string
- [encrypt](https://github.com/maxdeviant/redux-persist-transform-encrypt) - encrypt your serialized state with AES
- [filter](https://github.com/edy/redux-persist-transform-filter) - store or load a subset of your state
- [filter-immutable](https://github.com/actra-development/redux-persist-transform-filter-immutable) - store or load a subset of your state with support for immutablejs
- [expire](https://github.com/gabceb/redux-persist-transform-expire) - expire a specific subset of your state based on a property
- [expire-reducer](https://github.com/kamranahmedse/redux-persist-expire) - more flexible alternative to expire transformer above with more options

When the state object gets persisted, it first gets serialized with `JSON.stringify()`. If parts of your state object are not mappable to JSON objects, the serialization process may transform these parts of your state in unexpected ways. For example, the javascript [Set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set) type does not exist in JSON. When you try to serialize a Set via `JSON.stringify()`, it gets converted to an empty object. Probably not what you want.

Below is a Transform that successfully persists a Set property, which simply converts it to an array and back. In this way, the Set gets converted to an Array, which is a recognized data structure in JSON. When pulled out of the persisted store, the array gets converted back to a Set before being saved to the redux store.

```js
import { createTransform } from 'redux-persist';

const SetTransform = createTransform(
  // transform state on its way to being serialized and persisted.
  (inboundState, key) => {
    // convert mySet to an Array.
    return { ...inboundState, mySet: [...inboundState.mySet] };
  },
  // transform state being rehydrated
  (outboundState, key) => {
    // convert mySet back to a Set.
    return { ...outboundState, mySet: new Set(outboundState.mySet) };
  },
  // define which reducers this transform gets called for.
  { whitelist: ['someReducer'] }
);

export default SetTransform;
```

The `createTransform` function takes three parameters.
1. An "inbound" function that gets called right before state is persisted (optional).
2. An "outbound" function that gets called right before state is rehydrated (optional).
3. A config object that determines which keys in your state will be transformed (by default no keys are transformed).

In order to take effect transforms need to be added to a `PersistReducer`’s config object.

```
import storage from 'redux-persist/lib/storage';
import { SetTransform } from './transforms';

const persistConfig = {
  key: 'root',
  storage: storage,
  transforms: [SetTransform]
};
```

## Storage Engines
- **localStorage** `import storage from 'redux-persist/lib/storage'`
- **sessionStorage** `import storageSession from 'redux-persist/lib/storage/session'`
- **[electron storage](https://github.com/psperber/redux-persist-electron-storage)** Electron support via [electron store](https://github.com/sindresorhus/electron-store)
- **[redux-persist-cookie-storage](https://github.com/abersager/redux-persist-cookie-storage)** Cookie storage engine, works in browser and Node.js, for universal / isomorphic apps
- **[redux-persist-expo-filesystem](https://github.com/t73liu/redux-persist-expo-filesystem)** react-native, similar to redux-persist-filesystem-storage but does not require linking or ejecting CRNA/Expo app. Only available if using Expo SDK (Expo, create-react-native-app, standalone).
- **[redux-persist-expo-securestore](https://github.com/Cretezy/redux-persist-expo-securestore)** react-native, for sensitive information using Expo's SecureStore. Only available if using Expo SDK (Expo, create-react-native-app, standalone).
- **[redux-persist-fs-storage](https://github.com/leethree/redux-persist-fs-storage)** react-native-fs engine
- **[redux-persist-filesystem-storage](https://github.com/robwalkerco/redux-persist-filesystem-storage)** react-native, to mitigate storage size limitations in android ([#199](https://github.com/rt2zz/redux-persist/issues/199), [#284](https://github.com/rt2zz/redux-persist/issues/284))
  **[redux-persist-indexeddb-storage](https://github.com/machester4/redux-persist-indexeddb-storage)** recommended for web via [localForage](https://github.com/localForage/localForage)
- **[redux-persist-node-storage](https://github.com/pellejacobs/redux-persist-node-storage)** for use in nodejs environments.
- **[redux-persist-pouchdb](https://github.com/yanick/redux-persist-pouchdb)** Storage engine for PouchDB.
- **[redux-persist-sensitive-storage](https://github.com/CodingZeal/redux-persist-sensitive-storage)** react-native, for sensitive information (uses [react-native-sensitive-info](https://github.com/mCodex/react-native-sensitive-info)).
- **[redux-persist-weapp-storage](https://github.com/cuijiemmx/redux-casa/tree/master/packages/redux-persist-weapp-storage)** Storage engine for wechat mini program, also compatible with wepy
- **[redux-persist-webextension-storage](https://github.com/ssorallen/redux-persist-webextension-storage)** Storage engine for browser (Chrome, Firefox) web extension storage
- **[@bankify/redux-persist-realm](https://github.com/bankifyio/redux-persist-realm)** Storage engine for Realm database, you will need to install Realm first
- **custom** any conforming storage api implementing the following methods: `setItem` `getItem` `removeItem`. (**NB**: These methods must support promises)

## Community & Contributing

I will be updating this section shortly. If you have a pull request that you've got outstanding, please reach out and I will try to review it and get it integrated. As we've shifted to TypeScript, that may necessitate some changes, but I'm happy to help in that regard, wherever I can.
