import test from 'ava'
import sinon from 'sinon'
import createMemoryStorage from './utils/createMemoryStorage'
import createPersistoid from '../src/createPersistoid'
const memoryStorage = createMemoryStorage()

const config = {
  key: 'persist-reducer-test',
  version: 1,
  storage: memoryStorage,
  debug: true
}

let spy: sinon.SinonSpy;
let clock: sinon.SinonFakeTimers;

test.beforeEach(() => {
    spy = sinon.spy(memoryStorage, 'setItem')
    clock = sinon.useFakeTimers()
});

test.afterEach(() => {
    spy.restore()
    clock.restore()
});

// @NOTE these tests broke when updating sinon
test.skip('it updates changed state', t => {
    const { update } = createPersistoid(config)
    update({ a: 1 })
    clock.tick(1);
    update({ a: 2 })
    clock.tick(1);
    t.true(spy.calledTwice);
    t.true(spy.withArgs('persist:persist-reducer-test', '{"a":"1"}').calledOnce);
    t.true(spy.withArgs('persist:persist-reducer-test', '{"a":"2"}').calledOnce);
})

test.skip('it does not update unchanged state', t => {
    const { update } = createPersistoid(config)
    update({ a: undefined, b: 1 })
    clock.tick(1);
    // This update should not cause a write.
    update({ a: undefined, b: 1 })
    clock.tick(1);
    t.true(spy.calledOnce);
    t.true(spy.withArgs('persist:persist-reducer-test', '{"b":"1"}').calledOnce);
})

test.skip('it updates removed keys', t => {
    const { update } = createPersistoid(config)
    update({ a: undefined, b: 1 })
    clock.tick(1);
    update({ a: undefined, b: undefined })
    clock.tick(1);
    t.true(spy.calledTwice);
    t.true(spy.withArgs('persist:persist-reducer-test', '{"b":"1"}').calledOnce);
    t.true(spy.withArgs('persist:persist-reducer-test', '{}').calledOnce);
})
