/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'ava'
import { createElement, StrictMode, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'

import { PersistGate, useRehydrated } from '../src/integration/react'
import type { Persistor } from '../src/types'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

// A persistor whose bootstrap is triggered by the test
const createPersistor = (bootstrapped = false) => {
  let state = { registry: [] as string[], bootstrapped }
  const listeners = new Set<() => void>()
  const persistor = {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  } as unknown as Persistor
  const setBootstrapped = (bootstrapped: boolean) => {
    state = { ...state, bootstrapped }
    listeners.forEach(listener => listener())
  }
  const bootstrap = () => setBootstrapped(true)
  return { persistor, bootstrap, setBootstrapped, listenerCount: () => listeners.size }
}

const gate = (props: Record<string, any>, children: ReactNode | ((b: boolean) => ReactNode)) =>
  createElement(PersistGate as any, { ...props, children })

const render = (element: any): ReactTestRenderer => {
  let renderer: ReactTestRenderer
  act(() => { renderer = create(element) })
  return renderer!
}

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON())

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

test.serial('renders loading until bootstrapped, then children', async t => {
  const { persistor, bootstrap } = createPersistor()
  const renderer = render(gate({ persistor, loading: 'loading' }, 'app'))
  t.is(text(renderer), '"loading"')
  await act(async () => { bootstrap() })
  t.is(text(renderer), '"app"')
})

test.serial('renders children on the first render when already bootstrapped (#1070)', t => {
  const { persistor } = createPersistor(true)
  const renders: string[] = []
  const App = () => { renders.push('app'); return 'app' }
  const Loading = () => { renders.push('loading'); return 'loading' }
  render(gate({ persistor, loading: createElement(Loading) }, createElement(App)))
  t.deepEqual(renders, ['app'])
})

test.serial('calls a function child with the bootstrapped state', async t => {
  const { persistor, bootstrap } = createPersistor()
  const calls: boolean[] = []
  const renderer = render(gate({ persistor }, (bootstrapped: boolean) => { calls.push(bootstrapped); return bootstrapped ? 'app' : 'splash' }))
  t.is(text(renderer), '"splash"')
  await act(async () => { bootstrap() })
  t.is(text(renderer), '"app"')
  t.deepEqual([calls[0], calls[calls.length - 1]], [false, true])
})

test.serial('waits for onBeforeLift before lifting, and calls it once', async t => {
  const { persistor, bootstrap } = createPersistor()
  let resolveLift: () => void = () => {}
  let calls = 0
  const onBeforeLift = () => { calls++; return new Promise<void>(resolve => { resolveLift = resolve }) }
  const renderer = render(gate({ persistor, loading: 'loading', onBeforeLift }, 'app'))
  await act(async () => { bootstrap(); await tick() })
  t.is(text(renderer), '"loading"')
  await act(async () => { resolveLift(); await tick() })
  t.is(text(renderer), '"app"')
  t.is(calls, 1)
})

test.serial('calls onBeforeLift once in StrictMode when already bootstrapped at mount', async t => {
  const { persistor } = createPersistor(true)
  let calls = 0
  const renderer = render(createElement(StrictMode, null, gate({ persistor, loading: 'loading', onBeforeLift: () => { calls++ } }, 'app')))
  await act(async () => { await tick() })
  t.is(text(renderer), '"app"')
  t.is(calls, 1)
})

test.serial('calls onBeforeLift once in StrictMode', async t => {
  const { persistor, bootstrap } = createPersistor()
  let calls = 0
  const renderer = render(createElement(StrictMode, null, gate({ persistor, loading: 'loading', onBeforeLift: () => { calls++ } }, 'app')))
  await act(async () => { bootstrap(); await tick() })
  t.is(text(renderer), '"app"')
  t.is(calls, 1)
})

test.serial('lifts even if onBeforeLift rejects', async t => {
  const { persistor, bootstrap } = createPersistor()
  const renderer = render(gate({ persistor, loading: 'loading', onBeforeLift: () => Promise.reject(new Error('nope')) }, 'app'))
  await act(async () => { bootstrap(); await tick() })
  t.is(text(renderer), '"app"')
})

test.serial('unsubscribes on unmount', t => {
  const { persistor, listenerCount } = createPersistor()
  const renderer = render(gate({ persistor, loading: 'loading' }, 'app'))
  t.is(listenerCount(), 1)
  act(() => { renderer.unmount() })
  t.is(listenerCount(), 0)
})

test.serial('useRehydrated returns whether the persistor has bootstrapped', async t => {
  const { persistor, bootstrap } = createPersistor()
  const seen: boolean[] = []
  const Probe = () => { const rehydrated = useRehydrated(persistor); seen.push(rehydrated); return String(rehydrated) }
  const renderer = render(createElement(Probe))
  t.is(text(renderer), '"false"')
  await act(async () => { bootstrap() })
  t.is(text(renderer), '"true"')
  t.deepEqual([seen[0], seen[seen.length - 1]], [false, true])
})

test.serial('useRehydrated catches a bootstrap that happens before it subscribes', async t => {
  const { persistor, bootstrap } = createPersistor()
  const Probe = () => {
    const rehydrated = useRehydrated(persistor)
    // bootstrap during render, after the initial state was read but before the effect subscribes
    if (!rehydrated && !persistor.getState().bootstrapped) bootstrap()
    return String(rehydrated)
  }
  const renderer = render(createElement(Probe))
  t.is(text(renderer), '"true"')
})

test.serial('useRehydrated reports the current persistor when it changes', async t => {
  const ready = createPersistor(true)
  const pending = createPersistor(false)
  const committed: Array<{ actual: boolean, reported: boolean }> = []
  const Probe = ({ persistor }: { persistor: Persistor }) => {
    const reported = useRehydrated(persistor)
    useLayoutEffect(() => {
      committed.push({ actual: persistor.getState().bootstrapped, reported })
    })
    return String(reported)
  }
  const renderer = render(createElement(Probe, { persistor: ready.persistor }))
  act(() => { renderer.update(createElement(Probe, { persistor: pending.persistor })) })
  t.true(committed.every(c => c.actual === c.reported), JSON.stringify(committed))
  t.is(text(renderer), '"false"')
  await act(async () => { pending.bootstrap() })
  t.is(text(renderer), '"true"')
})

test.serial('useRehydrated re-renders when a new persistor bootstraps before the hook subscribes', async t => {
  const ready = createPersistor(true)
  const pending = createPersistor(false)
  const Probe = ({ persistor }: { persistor: Persistor }) => {
    const reported = useRehydrated(persistor)
    // layout effects run before the hook's subscription effect
    useLayoutEffect(() => {
      if (persistor === pending.persistor && !persistor.getState().bootstrapped) pending.bootstrap()
    })
    return String(reported)
  }
  const renderer = render(createElement(Probe, { persistor: ready.persistor }))
  await act(async () => { renderer.update(createElement(Probe, { persistor: pending.persistor })) })
  t.true(pending.persistor.getState().bootstrapped)
  t.is(text(renderer), '"true"')
})

test.serial('stays lifted when the persistor reports loading again', async t => {
  // persistReducers added later register and rehydrate one by one
  const { persistor, bootstrap, setBootstrapped } = createPersistor()
  const renderer = render(gate({ persistor, loading: 'loading' }, 'app'))
  await act(async () => { bootstrap() })
  t.is(text(renderer), '"app"')
  await act(async () => { setBootstrapped(false) })
  t.is(text(renderer), '"app"')
  await act(async () => { bootstrap() })
  t.is(text(renderer), '"app"')
})

test.serial('works with a persistor whose methods use this', async t => {
  class ClassPersistor {
    state = { registry: [] as string[], bootstrapped: false }
    listeners: Array<() => void> = []
    getState() { return this.state }
    subscribe(listener: () => void) {
      this.listeners.push(listener)
      return () => { this.listeners = this.listeners.filter(l => l !== listener) }
    }
    bootstrap() {
      this.state = { ...this.state, bootstrapped: true }
      this.listeners.forEach(listener => listener())
    }
  }
  const persistor = new ClassPersistor()
  const Probe = () => String(useRehydrated(persistor as unknown as Persistor))
  const renderer = render(createElement('div', null, gate({ persistor, loading: 'loading' }, 'app'), createElement(Probe)))
  t.is(text(renderer), JSON.stringify({ type: 'div', props: {}, children: ['loading', 'false'] }))
  await act(async () => { persistor.bootstrap() })
  t.is(text(renderer), JSON.stringify({ type: 'div', props: {}, children: ['app', 'true'] }))
})
