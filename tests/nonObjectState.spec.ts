/* eslint-disable @typescript-eslint/no-explicit-any */
// #215: persistReducer needs object state; arrays and primitives get a clear
// development error instead of being silently turned into objects.
import test from 'ava'
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

test.serial('warns once for array state', async t => {
  const errors = await errorsFor([])
  t.is(errors.length, 1)
  t.regex(errors[0], /is an array.*\{ items: \[\] \}/)
})

test.serial('warns for primitive and null state', async t => {
  t.regex((await errorsFor(0))[0], /is a number/)
  t.regex((await errorsFor('text'))[0], /is a string/)
  t.regex((await errorsFor(null))[0], /is null/)
})

test.serial('does not warn for object state', async t => {
  t.deepEqual(await errorsFor({ items: [] }), [])
})
