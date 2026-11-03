/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from 'vitest'

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

test('does not throw when serializing the whole state fails', async () => {
  const { control, serialize } = createSerialize()
  control.failWholeState = true
  const { update, flush } = createPersistoid({
    key: 'serialize-test',
    storage: createMemoryStorage(),
    serialize,
    writeFailHandler: () => {},
  })
  update({ a: 1 })
  await expect(Promise.resolve().then(flush)).resolves.not.toThrow()
})

test('passes the serialize error to writeFailHandler and skips the write', async () => {
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
  expect(errors).toHaveLength(1)
  expect(errors[0]).toBeInstanceOf(RangeError)
  expect(await storage.getItem(STORAGE_KEY)).toBeUndefined()
})

test('leaves previously stored state intact when serializing fails', async () => {
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
  expect(stored).toBe(JSON.stringify({ a: '1' }))

  control.failWholeState = true
  update({ a: 2 })
  await flush()
  expect(await storage.getItem(STORAGE_KEY)).toBe(stored)
})
