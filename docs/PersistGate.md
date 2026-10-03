`PersistGate` delays the rendering of your app's UI until your persisted state has been retrieved and saved to redux.

**NOTE**: the `loading` prop can be `null` or any react instance to show during loading (e.g. a splash screen), for example `loading={<Loading />}`.

Example usage:

```js
import { PersistGate } from 'redux-persist/react'

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

If stored state has already loaded when `PersistGate` first renders, the children render right away, without showing `loading`.

`onBeforeLift` is called once, after stored state has loaded and before the children render. If it returns a promise, the gate waits for it. If it throws or rejects, the gate still lifts (the error is logged in development).

## Modes
Redux persist ships with react integration as a convenience. The `PersistGate` component is the recommended way to delay rendering until persistence is complete. It works in one of two modes:
1. `loading` prop: The provided loading value will be rendered until persistence is complete at which point children will be rendered.
2. function children: The function will be invoked with a single `bootstrapped` argument. When bootstrapped is true, persistence is complete and it is safe to render the full app. This can be useful for adding transition animations.

## `useRehydrated`
To check whether stored state has loaded without a gate, use the `useRehydrated` hook (React 16.8+). It re-renders the component when loading finishes:

```js
import { useRehydrated } from 'redux-persist/react'

const Header = () => {
  const rehydrated = useRehydrated(persistor)
  return rehydrated ? <UserMenu /> : <Spinner />
}
```
