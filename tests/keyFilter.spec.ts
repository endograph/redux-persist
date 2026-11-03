/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from 'vitest'

import createPersistoid from '../src/createPersistoid'
import createTransform from '../src/createTransform'
import createMemoryStorage from './utils/createMemoryStorage'

const STATE = { user: { name: 'Ada' }, settings: { theme: 'dark' }, count: 3, _persist: { version: -1, rehydrated: true } }

const written = async (config: Record<string, any>) => {
  const storage = createMemoryStorage()
  const { update, flush } = createPersistoid({ key: 'filter', storage, ...config } as any)
  update(STATE)
  await flush()
  return storage.getItem('persist:filter')
}

const quietWarnings = () => {
  const warnings: any[][] = []
  const warn = console.warn
  console.warn = (...args: any[]) => { warnings.push(args) }
  return { warnings, restore: () => { console.warn = warn } }
}

test('allowlist writes the same data as whitelist', async () => {
  expect(await written({ allowlist: ['user', 'count'] })).toBe(await written({ whitelist: ['user', 'count'] }))
  expect(Object.keys(JSON.parse(await written({ allowlist: ['user', 'count'] })))).toStrictEqual(['user', 'count', '_persist'])
})

test('denylist writes the same data as blacklist', async () => {
  expect(await written({ denylist: ['user'] })).toBe(await written({ blacklist: ['user'] }))
  expect(Object.keys(JSON.parse(await written({ denylist: ['user'] })))).toStrictEqual(['settings', 'count', '_persist'])
})

test('when both names are given, the new one wins with a warning', async () => {
  const { warnings, restore } = quietWarnings()
  try {
    expect(await written({ allowlist: ['user'], whitelist: ['count'] })).toBe(await written({ allowlist: ['user'] }))
    expect(await written({ denylist: ['user'], blacklist: ['count'] })).toBe(await written({ denylist: ['user'] }))
  } finally {
    restore()
  }
  expect(warnings).toHaveLength(2)
})

test('old names alone do not warn', async () => {
  const { warnings, restore } = quietWarnings()
  try {
    await written({ whitelist: ['user'] })
    await written({ blacklist: ['user'] })
  } finally {
    restore()
  }
  expect(warnings).toHaveLength(0)
})

test('createTransform applies to allowlisted keys and skips denylisted ones', () => {
  const upper = (s: any) => ({ ...s, name: String(s.name).toUpperCase() })
  const allow = createTransform(upper, upper, { allowlist: ['user'] })
  const deny = createTransform(upper, upper, { denylist: ['user'] })
  const legacy = createTransform(upper, upper, { whitelist: ['user'] })
  expect(allow.in({ name: 'ada' } as any, 'user', {})).toStrictEqual({ name: 'ADA' })
  expect(allow.in({ name: 'ada' } as any, 'other', {})).toStrictEqual({ name: 'ada' })
  expect(deny.out({ name: 'ada' } as any, 'user', {})).toStrictEqual({ name: 'ada' })
  expect(deny.out({ name: 'ada' } as any, 'other', {})).toStrictEqual({ name: 'ADA' })
  expect(legacy.in({ name: 'ada' } as any, 'user', {})).toStrictEqual({ name: 'ADA' })
})

test('allowlist and denylist take a function of the key (#1283)', async () => {
  expect(await written({ allowlist: (key: string) => key !== 'settings' })).toBe(await written({ allowlist: ['user', 'count'] }))
  expect(await written({ denylist: (key: string) => key.startsWith('s') })).toBe(await written({ denylist: ['settings'] }))
})

test('_persist is always written, and a function filter is never called with it', async () => {
  const seen: string[] = []
  const stored = JSON.parse(await written({ denylist: (key: string) => { seen.push(key); return key.startsWith('_') } }))
  expect(Object.keys(stored)).toStrictEqual(['user', 'settings', 'count', '_persist'])
  expect(seen.includes('_persist')).toBe(false)
  expect(Object.keys(JSON.parse(await written({ allowlist: () => false })))).toStrictEqual(['_persist'])
})

test('createTransform takes a function allowlist or denylist', () => {
  const upper = (s: any) => ({ ...s, name: String(s.name).toUpperCase() })
  const allow = createTransform(upper, upper, { allowlist: key => key.startsWith('user') })
  const deny = createTransform(upper, upper, { denylist: key => key === 'user' })
  expect(allow.in({ name: 'ada' } as any, 'userProfile', {})).toStrictEqual({ name: 'ADA' })
  expect(allow.in({ name: 'ada' } as any, 'other', {})).toStrictEqual({ name: 'ada' })
  expect(deny.out({ name: 'ada' } as any, 'user', {})).toStrictEqual({ name: 'ada' })
  expect(deny.out({ name: 'ada' } as any, 'other', {})).toStrictEqual({ name: 'ADA' })
})
