// Loaded instead of ./react.js under the "react-server" export condition, i.e.
// when a React Server Component (Next.js App Router) imports redux-persist's
// React integration. PersistGate and useRehydrated need state and effects, so
// they must render from a Client Component; fail with a clear message rather
// than "Class extends value undefined".
import type { PersistGateProps } from './react.js'
import type { Persistor } from '../types.js'

const message = (name: string) =>
  `redux-persist: ${name} can only be used in a Client Component. Render it from a file that starts with 'use client' (for example a Providers component that also renders react-redux's Provider), not from a Server Component.`

export function useRehydrated(persistor: Persistor): boolean {
  void persistor
  throw new Error(message('useRehydrated'))
}

export function PersistGate(props: PersistGateProps): never {
  void props
  throw new Error(message('PersistGate'))
}

export type { PersistGateProps }
