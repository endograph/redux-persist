import test from 'ava'

import { PersistGate, useRehydrated } from '../src/integration/react.server'
import type { Persistor } from '../src/types'

// redux-persist/react resolves to this module under the "react-server" export
// condition (React Server Components); it must fail with guidance.
test('PersistGate and useRehydrated explain that they need a Client Component', t => {
  const persistor = {} as Persistor
  t.throws(() => PersistGate({ persistor }), { message: /PersistGate can only be used in a Client Component.*'use client'/ })
  t.throws(() => useRehydrated(persistor), { message: /useRehydrated can only be used in a Client Component/ })
})
