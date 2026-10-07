# Storage Engines

## Built in
- **localStorage** `import storage from 'redux-persist/storage'`
- **sessionStorage** `import storageSession from 'redux-persist/storage/session'`

Both store nothing during server rendering (no `window`), and stored state is loaded in the browser. If the browser blocks storage (for example in some privacy modes), a warning is logged in development and state isn't persisted.
- **custom** any conforming storage api implementing the following methods: `setItem` `getItem` `removeItem`. Each can return a promise or a plain value, so a synchronous storage engine works as is.

## Community
These packages are maintained by third parties, not by redux-persist. We don't review or vouch for them, so check that a package is maintained and trustworthy before you depend on it.

- **[electron storage](https://github.com/psperber/redux-persist-electron-storage)** Electron support via [electron store](https://github.com/sindresorhus/electron-store)
- **[redux-persist-cookie-storage](https://github.com/abersager/redux-persist-cookie-storage)** Cookie storage engine, works in browser and Node.js, for universal / isomorphic apps
- **[redux-persist-expo-filesystem](https://github.com/t73liu/redux-persist-expo-filesystem)** react-native, similar to redux-persist-filesystem-storage but does not require linking or ejecting CRNA/Expo app. Only available if using Expo SDK (Expo, create-react-native-app, standalone).
- **[redux-persist-expo-securestore](https://github.com/Cretezy/redux-persist-expo-securestore)** react-native, for sensitive information using Expo's SecureStore. Only available if using Expo SDK (Expo, create-react-native-app, standalone).
- **[redux-persist-fs-storage](https://github.com/leethree/redux-persist-fs-storage)** react-native-fs engine
- **[redux-persist-filesystem-storage](https://github.com/robwalkerco/redux-persist-filesystem-storage)** react-native, to mitigate storage size limitations in android ([#199](https://github.com/rt2zz/redux-persist/issues/199), [#284](https://github.com/rt2zz/redux-persist/issues/284))
- **[redux-persist-indexeddb-storage](https://github.com/machester4/redux-persist-indexeddb-storage)** recommended for web via [localForage](https://github.com/localForage/localForage)
- **[redux-persist-node-storage](https://github.com/pellejacobs/redux-persist-node-storage)** for use in nodejs environments.
- **[redux-persist-pouchdb](https://github.com/yanick/redux-persist-pouchdb)** Storage engine for PouchDB.
- **[redux-persist-weapp-storage](https://github.com/cuijiemmx/redux-casa/tree/master/packages/redux-persist-weapp-storage)** Storage engine for wechat mini program, also compatible with wepy
- **[redux-persist-webextension-storage](https://github.com/ssorallen/redux-persist-webextension-storage)** Storage engine for browser (Chrome, Firefox) web extension storage

For sensitive data such as auth tokens on React Native, use a storage engine backed by the iOS Keychain and Android Keystore, and check that the library you choose is actively maintained.
