`PersistGate` delays the rendering of your app's UI until your persisted state has been retrieved and saved to redux.

**NOTE**: the `loading` prop can be `null` or any react instance to show during loading (e.g. a splash screen), for example `loading={<Loading />}`.

Example usage:

```js
import { PersistGate } from 'redux-persist/es/integration/react'

import configureStore from './store/configureStore'

const { persistor, store } = configureStore()

const onBeforeLift = () => {
  // take some action before the gate lifts
}

export default () => (
  <Provider store={store}>
    <PersistGate 
      loading={<Loading />}
      onBeforeLift={onBeforeLift}
      persistor={persistor}>
      <App />
    </PersistGate>
  </Provider>
)
```

## Modes
Redux persist ships with react integration as a convenience. The `PersistGate` component is the recommended way to delay rendering until persistence is complete. It works in one of two modes:
1. `loading` prop: The provided loading value will be rendered until persistence is complete at which point children will be rendered.
2. function children: The function will be invoked with a single `bootstrapped` argument. When bootstrapped is true, persistence is complete and it is safe to render the full app. This can be useful for adding transition animations.
