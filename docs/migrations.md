# Redux Persist Migration Example

`persistReducer` has a general purpose "migrate" config which will be called after getting stored state but before actually reconciling with the reducer. It can be any function which takes state as an argument and returns a promise to return a new state object.

Redux Persist ships with `createMigrate`, which helps create a synchronous migration for moving from any version of stored state to the current state version.

Redux Persist runs every migration whose version is above the version of the stored state, up to the current `version`, in ascending order, and uses the result as the state to rehydrate. So whenever you change the shape of persisted state and want to keep your users' existing data, add a migration for the new version and increase `version` in the persist config.

### Example with createMigrate
```js
import { createMigrate, persistReducer, persistStore } from 'redux-persist'
import storage from 'redux-persist/storage'

const migrations = {
  0: (state) => {
    // migration clear out device state
    return {
      ...state,
      device: undefined   
    }
  },
  // Async functions are allowed
  1: async (state) => {
    // migration to keep only device state
    return {
      device: state.device
    }
  }
}

const persistConfig = {
  key: 'primary',
  version: 1,
  storage,
  migrate: createMigrate(migrations, { debug: false }),
}

const finalReducer = persistReducer(persistConfig, reducer)

export default function configureStore() {
  let store = createStore(finalReducer)
  let persistor = persistStore(store)
  return { store, persistor }
}
```

### Alternative
The migrate method can be any function with which returns a promise of new state. 
```js
const persistConfig = {
  key: 'primary',
  version: 1,
  storage,
  migrate: (state) => {
    console.log('Migration Running!')
    return Promise.resolve(state)
  }
}
