/* eslint-disable @typescript-eslint/no-explicit-any */
// #215: persistReducer needs object state; arrays and primitives get a clear
// development error instead of being silently turned into objects.
import { expect, test } from 'vitest'
import { legacy_createStore as createStore } from 'redux'

import { persistReducer, persistStore } from '../src'
import createMemoryStorage from './utils/createMemoryStorage'
import sleep from './utils/sleep'

const errorsFor = async (initial: any) => {
  const errors: string[] = []
  const original = console.error
  console.error = (...args: any[]) => { errors.push(String(args[0])) }
  try {
    const store = createStore(persistReducer({ key: 'root', storage: createMemoryStorage() }, (state: any = initial) => state))
    const persistor = persistStore(store)
    persistor.persist() // a repeat PERSIST must not warn again
    await sleep(10)
  } finally {
    console.error = original
  }
  return errors.filter(e => e.includes('needs its reducer\'s state to be a plain object'))
}

test('warns once for array state', async () => {
  const errors = await errorsFor([])
  expect(errors).toHaveLength(1)
  expect(errors[0]).toMatch(/is an array.*\{ items: \[\] \}/)
})

test('warns for primitive and null state', async () => {
  expect((await errorsFor(0))[0]).toMatch(/is a number/)
  expect((await errorsFor('text'))[0]).toMatch(/is a string/)
  expect((await errorsFor(null))[0]).toMatch(/is null/)
})

test('does not warn for object state', async () => {
  expect(await errorsFor({ items: [] })).toStrictEqual([])
})
