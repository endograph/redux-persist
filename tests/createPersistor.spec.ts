import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import createMemoryStorage from './utils/createMemoryStorage'
import createPersistoid from '../src/createPersistoid'
let config: { key: string, version: number, storage: ReturnType<typeof createMemoryStorage>, debug: boolean }
let spy: MockInstance;

// A fresh storage per test: these spy on setItem and fake timers.
beforeEach(() => {
    const memoryStorage = createMemoryStorage()
    config = { key: 'persist-reducer-test', version: 1, storage: memoryStorage, debug: true }
    spy = vi.spyOn(memoryStorage, 'setItem')
    vi.useFakeTimers()
});

afterEach(() => {
    spy.mockRestore()
    vi.useRealTimers()
});

test('it updates changed state', () => {
    const { update } = createPersistoid(config)
    update({ a: 1 })
    vi.advanceTimersByTime(1);
    update({ a: 2 })
    vi.advanceTimersByTime(1);
    expect(spy.mock.calls).toStrictEqual([
        ['persist:persist-reducer-test', '{"a":"1"}'],
        ['persist:persist-reducer-test', '{"a":"2"}'],
    ]);
})

test('it does not update unchanged state', () => {
    const { update } = createPersistoid(config)
    update({ a: undefined, b: 1 })
    vi.advanceTimersByTime(1);
    // This update should not cause a write.
    update({ a: undefined, b: 1 })
    vi.advanceTimersByTime(1);
    expect(spy.mock.calls).toStrictEqual([['persist:persist-reducer-test', '{"b":"1"}']]);
})

test('it updates removed keys', () => {
    const { update } = createPersistoid(config)
    update({ a: undefined, b: 1 })
    vi.advanceTimersByTime(1);
    update({ a: undefined, b: undefined })
    vi.advanceTimersByTime(1);
    expect(spy.mock.calls).toStrictEqual([
        ['persist:persist-reducer-test', '{"b":"1"}'],
        ['persist:persist-reducer-test', '{}'],
    ]);
})
