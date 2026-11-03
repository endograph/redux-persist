import { expect, test } from 'vitest'

import { PersistGate, useRehydrated } from '../src/integration/react.server'
import type { Persistor } from '../src/types'

// redux-persist/react resolves to this module under the "react-server" export
// condition (React Server Components); it must fail with guidance.
test('PersistGate and useRehydrated explain that they need a Client Component', () => {
  const persistor = {} as Persistor
  expect(() => PersistGate({ persistor })).toThrow(/PersistGate can only be used in a Client Component.*'use client'/)
  expect(() => useRehydrated(persistor)).toThrow(/useRehydrated can only be used in a Client Component/)
})
