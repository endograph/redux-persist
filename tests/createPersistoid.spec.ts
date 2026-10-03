/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'ava'

import createPersistoid from '../src/createPersistoid'
import createMemoryStorage from './utils/createMemoryStorage'

const STORAGE_KEY = 'persist:serialize-test'

// Serializes individual values normally, but throws when serializing the
// whole staged state (an object of already-serialized strings), like
// JSON.stringify does when the combined state exceeds the max string length.
const createSerialize = () => {
  const control = { failWholeState: false }
  const serialize = (data: any) => {
    const isWholeState =
      data !== null &&
      typeof data === 'object' &&
      Object.values(data).every(value => typeof value === 'string')
    if (control.failWholeState && isWholeState) {
      throw new RangeError('String length exceeds limit')
    }
    return JSON.stringify(data)
  }
  return { control, serialize }
}

test('does not throw when serializing the whole state fails', async t => {
  const { control, serialize } = createSerialize()
  control.failWholeState = true
  const { update, flush } = createPersistoid({
    key: 'serialize-test',
    storage: createMemoryStorage(),
    serialize,
    writeFailHandler: () => {},
  })
  update({ a: 1 })
  await t.notThrowsAsync(async () => flush())
})

test('passes the serialize error to writeFailHandler and skips the write', async t => {
  const { control, serialize } = createSerialize()
  control.failWholeState = true
  const storage = createMemoryStorage()
  const errors: any[] = []
  const { update, flush } = createPersistoid({
    key: 'serialize-test',
    storage,
    serialize,
    writeFailHandler: err => errors.push(err),
  })
  update({ a: 1 })
  await flush()
  t.is(errors.length, 1)
  t.true(errors[0] instanceof RangeError)
  t.is(await storage.getItem(STORAGE_KEY), undefined)
})

test('leaves previously stored state intact when serializing fails', async t => {
  const { control, serialize } = createSerialize()
  const storage = createMemoryStorage()
  const { update, flush } = createPersistoid({
    key: 'serialize-test',
    storage,
    serialize,
    writeFailHandler: () => {},
  })
  update({ a: 1 })
  await flush()
  const stored = await storage.getItem(STORAGE_KEY)
  t.is(stored, JSON.stringify({ a: '1' }))

  control.failWholeState = true
  update({ a: 2 })
  await flush()
  t.is(await storage.getItem(STORAGE_KEY), stored)
})
