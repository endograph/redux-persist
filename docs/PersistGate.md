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

## Next.js App Router (React Server Components)
`PersistGate`, `useRehydrated` and react-redux's `Provider` need state and effects, so they have to render from a Client Component. Layouts and pages in the App Router are Server Components by default, so put the providers in their own file that starts with `'use client'`:

```tsx
// app/providers.tsx
'use client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/react'
import { store, persistor } from '../lib/store'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        {children}
      </PersistGate>
    </Provider>
  )
}
```

```tsx
// app/layout.tsx (a Server Component)
import Providers from './providers'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

If `PersistGate` is rendered from a Server Component, it fails with an error saying it can only be used in a Client Component.
