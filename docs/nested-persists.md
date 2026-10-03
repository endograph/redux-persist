# Nested Persists
Nested persist can be useful for including different storage adapters, code splitting, or deep filtering. For example `allowlist` and `denylist` only work one level deep, but we can use a nested persist to deny a deeper value:
```js
import { combineReducers } from 'redux'
import { persistReducer } from 'redux-persist'
import storage from 'redux-persist/storage'

import { authReducer, otherReducer } from './reducers'

const rootPersistConfig = {
  key: 'root',
  storage: storage,
  denylist: ['auth']
}

const authPersistConfig = {
  key: 'auth',
  storage: storage,
  denylist: ['somethingTemporary']
}

const rootReducer = combineReducers({
  auth: persistReducer(authPersistConfig, authReducer),
  other: otherReducer,
})

export default persistReducer(rootPersistConfig, rootReducer)
```

The root config denies `auth` because the nested `persistReducer` already saves `auth` under its own key. If the root saved it too, `auth` would be stored twice, and the root copy would include `somethingTemporary`, the field the nested config is meant to exclude.
