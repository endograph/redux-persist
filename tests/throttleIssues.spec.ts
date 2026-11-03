/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import createMemoryStorage from './utils/createMemoryStorage'
import createPersistoid from '../src/createPersistoid'

let memoryStorage: ReturnType<typeof createMemoryStorage>
let spy: MockInstance

beforeEach(() => {
  memoryStorage = createMemoryStorage()
  spy = vi.spyOn(memoryStorage, 'setItem')
  vi.useFakeTimers()
})

afterEach(() => {
  spy.mockRestore()
  vi.useRealTimers()
})

// Issue #720: Total write time must not multiply by the number of changed keys.
// With N keys and throttle T, write time should be ~T ms, not N × T ms.
test(
  'write time grows with key count — 3 changed keys at throttle=100ms should produce one write within 100ms, not after 3×100ms=300ms (issue #720)',
  () => {
    const { update } = createPersistoid({ key: 'test', version: 1, storage: memoryStorage, throttle: 100 })
    update({ a: 1, b: 2, c: 3 })

    // Advance exactly one throttle interval. All 3 keys are batched and written
    // in this single timeout via flush().
    vi.advanceTimersByTime(100)

    expect(spy).toHaveBeenCalledTimes(1)
  }
)

// Issue #1171: Rapid state updates must not starve the write queue indefinitely.
// Previously, only one key was processed per throttle tick, so new updates could
// re-queue the just-processed key before the queue emptied, preventing any write.
test(
  'rapid updates do not starve the write queue — storage.setItem is called even when updates continuously re-queue keys (issue #1171)',
  () => {
    const { update } = createPersistoid({ key: 'test', version: 1, storage: memoryStorage, throttle: 100 })
    update({ a: 1, b: 2, c: 3, d: 4, e: 5 })

    // Each vi.advanceTimersByTime(100) fires flush() which processes all queued keys at once,
    // then a new update() re-queues changed keys for the next timeout.
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(100)
      update({ a: i + 2, b: i + 3, c: i + 4, d: i + 5, e: i + 6 })
    }

    // After 5 throttle intervals (500ms) at least one write to storage must have occurred.
    expect(spy).toHaveBeenCalled()
  }
)

// With the default throttle of 0, a burst of updates in one tick is still
// written once, not once per update.
test('throttle=0 batches a burst of updates into one write', () => {
  const { update } = createPersistoid({ key: 'test', version: 1, storage: memoryStorage, throttle: 0 })
  for (let i = 0; i < 100; i++) update({ a: i, b: i })
  expect(spy).not.toHaveBeenCalled()
  vi.advanceTimersByTime(0)
  expect(spy).toHaveBeenCalledTimes(1)
})

// flush() is what beforeunload and app-background handlers rely on, so it
// must write pending changes without waiting for the throttle timeout.
test('flush() writes pending changes without waiting for the throttle', () => {
  const { update, flush } = createPersistoid({ key: 'test', version: 1, storage: memoryStorage, throttle: 1000 })
  update({ a: 1 })
  flush()
  expect(spy).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(1000)
  expect(spy).toHaveBeenCalledTimes(1)
})

// A transform that throws once must not stop later writes: the pending timer
// has to be cleared even when processing a key throws.
test('writes resume after a transform throws', () => {
  let fail = true
  const transform = {
    in: (state: any) => { if (fail) throw new Error('transform failed'); return state },
    out: (state: any) => state,
  }
  const { update } = createPersistoid({ key: 'test', version: 1, storage: memoryStorage, throttle: 100, transforms: [transform] })
  update({ a: 1 })
  expect(() => vi.advanceTimersByTime(100)).toThrow('transform failed')

  fail = false
  update({ a: 2 })
  vi.advanceTimersByTime(100)
  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy.mock.calls[0][1]).toBe(JSON.stringify({ a: '2' }))
})
