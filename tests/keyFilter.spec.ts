/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'ava'

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

test('allowlist writes the same data as whitelist', async t => {
  t.is(await written({ allowlist: ['user', 'count'] }), await written({ whitelist: ['user', 'count'] }))
  t.deepEqual(Object.keys(JSON.parse(await written({ allowlist: ['user', 'count'] }))), ['user', 'count', '_persist'])
})

test('denylist writes the same data as blacklist', async t => {
  t.is(await written({ denylist: ['user'] }), await written({ blacklist: ['user'] }))
  t.deepEqual(Object.keys(JSON.parse(await written({ denylist: ['user'] }))), ['settings', 'count', '_persist'])
})

test.serial('when both names are given, the new one wins with a warning', async t => {
  const { warnings, restore } = quietWarnings()
  try {
    t.is(await written({ allowlist: ['user'], whitelist: ['count'] }), await written({ allowlist: ['user'] }))
    t.is(await written({ denylist: ['user'], blacklist: ['count'] }), await written({ denylist: ['user'] }))
  } finally {
    restore()
  }
  t.is(warnings.length, 2)
})

test.serial('old names alone do not warn', async t => {
  const { warnings, restore } = quietWarnings()
  try {
    await written({ whitelist: ['user'] })
    await written({ blacklist: ['user'] })
  } finally {
    restore()
  }
  t.is(warnings.length, 0)
})

test('createTransform applies to allowlisted keys and skips denylisted ones', t => {
  const upper = (s: any) => ({ ...s, name: String(s.name).toUpperCase() })
  const allow = createTransform(upper, upper, { allowlist: ['user'] })
  const deny = createTransform(upper, upper, { denylist: ['user'] })
  const legacy = createTransform(upper, upper, { whitelist: ['user'] })
  t.deepEqual(allow.in({ name: 'ada' } as any, 'user', {}), { name: 'ADA' })
  t.deepEqual(allow.in({ name: 'ada' } as any, 'other', {}), { name: 'ada' })
  t.deepEqual(deny.out({ name: 'ada' } as any, 'user', {}), { name: 'ada' })
  t.deepEqual(deny.out({ name: 'ada' } as any, 'other', {}), { name: 'ADA' })
  t.deepEqual(legacy.in({ name: 'ada' } as any, 'user', {}), { name: 'ADA' })
})

test('allowlist and denylist take a function of the key (#1283)', async t => {
  t.is(await written({ allowlist: (key: string) => key !== 'settings' }), await written({ allowlist: ['user', 'count'] }))
  t.is(await written({ denylist: (key: string) => key.startsWith('s') }), await written({ denylist: ['settings'] }))
})

test('_persist is always written, and a function filter is never called with it', async t => {
  const seen: string[] = []
  const stored = JSON.parse(await written({ denylist: (key: string) => { seen.push(key); return key.startsWith('_') } }))
  t.deepEqual(Object.keys(stored), ['user', 'settings', 'count', '_persist'])
  t.false(seen.includes('_persist'))
  t.deepEqual(Object.keys(JSON.parse(await written({ allowlist: () => false }))), ['_persist'])
})

test('createTransform takes a function allowlist or denylist', t => {
  const upper = (s: any) => ({ ...s, name: String(s.name).toUpperCase() })
  const allow = createTransform(upper, upper, { allowlist: key => key.startsWith('user') })
  const deny = createTransform(upper, upper, { denylist: key => key === 'user' })
  t.deepEqual(allow.in({ name: 'ada' } as any, 'userProfile', {}), { name: 'ADA' })
  t.deepEqual(allow.in({ name: 'ada' } as any, 'other', {}), { name: 'ada' })
  t.deepEqual(deny.out({ name: 'ada' } as any, 'user', {}), { name: 'ada' })
  t.deepEqual(deny.out({ name: 'ada' } as any, 'other', {}), { name: 'ADA' })
})
