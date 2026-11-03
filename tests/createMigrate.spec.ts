/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from 'vitest'

import createMigrate from '../src/createMigrate'

const persistedState = (version: number, rest: Record<string, any> = {}): any => ({
  ...rest,
  _persist: { version, rehydrated: false },
})

test('runs sync migrations in version order', async () => {
  const migrate = createMigrate({
    1: (state: any) => ({ ...state, steps: [...state.steps, 1] }),
    0: (state: any) => ({ ...state, steps: [...state.steps, 0] }),
  })
  const result: any = await migrate(persistedState(-1, { steps: [] }), 1)
  expect(result.steps).toStrictEqual([0, 1])
})

test('awaits async migrations before running the next one', async () => {
  const migrate = createMigrate({
    0: async (state: any) => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return { ...state, a: 1 }
    },
    1: (state: any) => ({ ...state, b: state.a + 1 }),
    2: async (state: any) => ({ ...state, c: state.b + 1 }),
  })
  const result: any = await migrate(persistedState(-1), 2)
  expect(result.a).toBe(1)
  expect(result.b).toBe(2)
  expect(result.c).toBe(3)
})

test('only runs migrations newer than the inbound version', async () => {
  const migrate = createMigrate({
    0: async (state: any) => ({ ...state, ran: [...state.ran, 0] }),
    1: async (state: any) => ({ ...state, ran: [...state.ran, 1] }),
    2: async (state: any) => ({ ...state, ran: [...state.ran, 2] }),
  })
  const result: any = await migrate(persistedState(0, { ran: [] }), 2)
  expect(result.ran).toStrictEqual([1, 2])
})

test('rejects when a sync migration throws', async () => {
  const migrate = createMigrate({
    0: () => {
      throw new Error('sync failure')
    },
  })
  await expect(migrate(persistedState(-1), 0)).rejects.toThrow('sync failure')
})

test('rejects when an async migration rejects', async () => {
  const migrate = createMigrate({
    0: async () => {
      throw new Error('async failure')
    },
  })
  await expect(migrate(persistedState(-1), 0)).rejects.toThrow('async failure')
})

test('resolves undefined when there is no inbound state', async () => {
  const migrate = createMigrate({ 0: async (state: any) => state })
  expect(await migrate(undefined, 0)).toBeUndefined()
})

test('returns state unchanged when versions match', async () => {
  const state = persistedState(1, { a: 1 })
  const migrate = createMigrate({ 1: async () => ({ replaced: true }) as any })
  expect(await migrate(state, 1)).toBe(state)
})
