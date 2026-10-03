// Compile-time checks for the React integration (type-checked by npm test).
import { PersistGate, useRehydrated } from '../../src/integration/react'
import type { Persistor } from '../../src'

declare const persistor: Persistor
const App = () => <div />

export const WithLoading = () => (
  <PersistGate loading={<span>loading</span>} persistor={persistor}>
    <App />
  </PersistGate>
)
export const WithoutLoading = () => (
  <PersistGate persistor={persistor}>
    <App />
  </PersistGate>
)
export const WithFunctionChild = () => (
  <PersistGate persistor={persistor} onBeforeLift={async () => {}}>
    {(bootstrapped: boolean) => (bootstrapped ? <App /> : null)}
  </PersistGate>
)
export const WithHook = () => {
  const rehydrated: boolean = useRehydrated(persistor)
  return rehydrated ? <App /> : null
}
// @ts-expect-error persistor is required
export const MissingPersistor = () => <PersistGate><App /></PersistGate>
