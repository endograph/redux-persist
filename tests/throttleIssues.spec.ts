/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'ava'
import sinon from 'sinon'
import createMemoryStorage from './utils/createMemoryStorage'
import createPersistoid from '../src/createPersistoid'

let memoryStorage: ReturnType<typeof createMemoryStorage>
let spy: sinon.SinonSpy
let clock: sinon.SinonFakeTimers

test.beforeEach(() => {
  memoryStorage = createMemoryStorage()
  spy = sinon.spy(memoryStorage, 'setItem')
  clock = sinon.useFakeTimers()
})

test.afterEach.always(() => {
  spy.restore()
  clock.restore()
})

// Issue #720: Total write time must not multiply by the number of changed keys.
// With N keys and throttle T, write time should be ~T ms, not N × T ms.
test.serial(
  'write time grows with key count — 3 changed keys at throttle=100ms should produce one write within 100ms, not after 3×100ms=300ms (issue #720)',
  (t) => {
    const { update } = createPersistoid({ key: 'test', version: 1, storage: memoryStorage, throttle: 100 })
    update({ a: 1, b: 2, c: 3 })

    // Advance exactly one throttle interval. All 3 keys are batched and written
    // in this single timeout via flush().
    clock.tick(100)

    t.true(spy.calledOnce)
  }
)

// Issue #1171: Rapid state updates must not starve the write queue indefinitely.
// Previously, only one key was processed per throttle tick, so new updates could
// re-queue the just-processed key before the queue emptied, preventing any write.
test.serial(
  'rapid updates do not starve the write queue — storage.setItem is called even when updates continuously re-queue keys (issue #1171)',
  (t) => {
    const { update } = createPersistoid({ key: 'test', version: 1, storage: memoryStorage, throttle: 100 })
    update({ a: 1, b: 2, c: 3, d: 4, e: 5 })

    // Each clock.tick(100) fires flush() which processes all queued keys at once,
    // then a new update() re-queues changed keys for the next timeout.
    for (let i = 0; i < 5; i++) {
      clock.tick(100)
      update({ a: i + 2, b: i + 3, c: i + 4, d: i + 5, e: i + 6 })
    }

    // After 5 throttle intervals (500ms) at least one write to storage must have occurred.
    t.true(spy.called)
  }
)

// With the default throttle of 0, a burst of updates in one tick is still
// written once, not once per update.
test.serial('throttle=0 batches a burst of updates into one write', (t) => {
  const { update } = createPersistoid({ key: 'test', version: 1, storage: memoryStorage, throttle: 0 })
  for (let i = 0; i < 100; i++) update({ a: i, b: i })
  t.true(spy.notCalled)
  clock.tick(0)
  t.true(spy.calledOnce)
})

// flush() is what beforeunload and app-background handlers rely on, so it
// must write pending changes without waiting for the throttle timeout.
test.serial('flush() writes pending changes without waiting for the throttle', (t) => {
  const { update, flush } = createPersistoid({ key: 'test', version: 1, storage: memoryStorage, throttle: 1000 })
  update({ a: 1 })
  flush()
  t.true(spy.calledOnce)
  clock.tick(1000)
  t.true(spy.calledOnce)
})

// A transform that throws once must not stop later writes: the pending timer
// has to be cleared even when processing a key throws.
test.serial('writes resume after a transform throws', (t) => {
  let fail = true
  const transform = {
    in: (state: any) => { if (fail) throw new Error('transform failed'); return state },
    out: (state: any) => state,
  }
  const { update } = createPersistoid({ key: 'test', version: 1, storage: memoryStorage, throttle: 100, transforms: [transform] })
  update({ a: 1 })
  t.throws(() => clock.tick(100), { message: 'transform failed' })

  fail = false
  update({ a: 2 })
  clock.tick(100)
  t.true(spy.calledOnce)
  t.is(spy.firstCall.args[1], JSON.stringify({ a: '2' }))
})
