/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'ava'

import createMigrate from '../src/createMigrate'

const persistedState = (version: number, rest: Record<string, any> = {}): any => ({
  ...rest,
  _persist: { version, rehydrated: false },
})

test('runs sync migrations in version order', async t => {
  const migrate = createMigrate({
    1: (state: any) => ({ ...state, steps: [...state.steps, 1] }),
    0: (state: any) => ({ ...state, steps: [...state.steps, 0] }),
  })
  const result: any = await migrate(persistedState(-1, { steps: [] }), 1)
  t.deepEqual(result.steps, [0, 1])
})

test('awaits async migrations before running the next one', async t => {
  const migrate = createMigrate({
    0: async (state: any) => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return { ...state, a: 1 }
    },
    1: (state: any) => ({ ...state, b: state.a + 1 }),
    2: async (state: any) => ({ ...state, c: state.b + 1 }),
  })
  const result: any = await migrate(persistedState(-1), 2)
  t.is(result.a, 1)
  t.is(result.b, 2)
  t.is(result.c, 3)
})

test('only runs migrations newer than the inbound version', async t => {
  const migrate = createMigrate({
    0: async (state: any) => ({ ...state, ran: [...state.ran, 0] }),
    1: async (state: any) => ({ ...state, ran: [...state.ran, 1] }),
    2: async (state: any) => ({ ...state, ran: [...state.ran, 2] }),
  })
  const result: any = await migrate(persistedState(0, { ran: [] }), 2)
  t.deepEqual(result.ran, [1, 2])
})

test('rejects when a sync migration throws', async t => {
  const migrate = createMigrate({
    0: () => {
      throw new Error('sync failure')
    },
  })
  await t.throwsAsync(migrate(persistedState(-1), 0), { message: 'sync failure' })
})

test('rejects when an async migration rejects', async t => {
  const migrate = createMigrate({
    0: async () => {
      throw new Error('async failure')
    },
  })
  await t.throwsAsync(migrate(persistedState(-1), 0), { message: 'async failure' })
})

test('resolves undefined when there is no inbound state', async t => {
  const migrate = createMigrate({ 0: async (state: any) => state })
  t.is(await migrate(undefined, 0), undefined)
})

test('returns state unchanged when versions match', async t => {
  const state = persistedState(1, { a: 1 })
  const migrate = createMigrate({ 1: async () => ({ replaced: true }) as any })
  t.is(await migrate(state, 1), state)
})
