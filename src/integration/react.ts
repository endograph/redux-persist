import * as ReactModule from 'react'
import type { ReactNode } from 'react'

// Node's native ESM loader can't see the named exports of React's CommonJS
// build before 16.13, but the module's default export is the whole module.
const React: typeof ReactModule =
  (ReactModule as unknown as { default?: typeof ReactModule }).default || ReactModule
import type { Persistor } from '../types.js'

// React 18+
const useSyncExternalStore = (React as { useSyncExternalStore?: typeof ReactModule.useSyncExternalStore })
  .useSyncExternalStore
const subscribeToNothing = () => () => {}

// Whether this component was rendered on the server or while hydrating
// server HTML, rather than first rendered in the browser. React calls
// getServerSnapshot only in those two cases, so it marks the component, and
// getSnapshot keeps returning the same answer afterwards: React has no change
// to re-render for once hydration is done (that re-render would be
// synchronous, which React 18 handles badly). React 16 and 17 can't tell, so
// they count every render as a browser render.
function useRenderedFromServer(): boolean {
  const fromServer = React.useRef(false)
  if (!useSyncExternalStore) return false
  return useSyncExternalStore(
    subscribeToNothing,
    () => fromServer.current,
    () => (fromServer.current = true)
  )
}

// Whether the persistor has loaded stored state, re-rendering when that
// changes. Read from the current persistor on every render, so switching
// persistors never reports the previous one's status; state only triggers
// re-renders.
function useBootstrapped(persistor: Persistor): boolean {
  const bootstrapped = persistor.getState().bootstrapped
  // remembers which persistor it saw, so after a switch the update below
  // always differs from the retained state and re-renders
  const [, setSeen] = React.useState({ persistor, bootstrapped })

  React.useEffect(() => {
    const update = () => {
      const next = persistor.getState().bootstrapped
      setSeen(seen => (seen.persistor === persistor && seen.bootstrapped === next ? seen : { persistor, bootstrapped: next }))
    }
    const unsubscribe = persistor.subscribe(update)
    // it may have bootstrapped between rendering and subscribing
    update()
    return unsubscribe
  }, [persistor])

  return bootstrapped
}

/**
 * Returns whether the persistor has finished loading stored state, and
 * re-renders when it does. Needs React 16.8+.
 *
 * Stored state only loads in the browser, so on the server it returns false.
 * With React 18+ it also returns false while hydrating, so the first render
 * matches the server's HTML, and changes to true in a normal update after.
 */
export function useRehydrated(persistor: Persistor): boolean {
  const fromServer = useRenderedFromServer()
  const [hydrated, setHydrated] = React.useState(!fromServer)
  React.useEffect(() => {
    if (!hydrated) setHydrated(true)
  }, [hydrated])
  const bootstrapped = useBootstrapped(persistor)
  return hydrated && bootstrapped
}

export interface PersistGateProps {
  persistor: Persistor
  /**
   * Rendered until stored state has loaded. Ignored when `children` is a function.
   */
  loading?: ReactNode
  /**
   * Called once stored state has loaded, before children are rendered. If it
   * returns a promise, rendering waits for it to settle.
   */
  onBeforeLift?: () => void | Promise<void>
  children?: ReactNode | ((bootstrapped: boolean) => ReactNode)
}

// The gate itself, a function component so it can use useRehydrated
function Gate({ persistor, loading, onBeforeLift, children }: PersistGateProps): ReactNode {
  const bootstrapped = useRehydrated(persistor)
  // onBeforeLift runs once, even when StrictMode mounts the component twice
  const beforeLift = React.useRef<Promise<void> | null>(null)
  const [beforeLiftDone, setBeforeLiftDone] = React.useState(false)
  // Once lifted, the gate stays lifted, even if the persistor briefly reports
  // loading again (persistReducers added later rehydrating).
  const [lifted, setLifted] = React.useState(false)
  const liftNow = bootstrapped && (!onBeforeLift || beforeLiftDone)
  if (liftNow && !lifted) setLifted(true)
  const open = lifted || liftNow

  React.useEffect(() => {
    if (open || !bootstrapped || !onBeforeLift) return
    let active = true
    if (!beforeLift.current)
      beforeLift.current = Promise.resolve()
        .then(() => onBeforeLift())
        .catch(err => {
          if (process.env.NODE_ENV !== 'production')
            console.error('redux-persist: onBeforeLift failed; lifting PersistGate anyway.', err)
        })
    beforeLift.current.then(() => {
      if (active) setBeforeLiftDone(true)
    })
    return () => {
      active = false
    }
  }, [open, bootstrapped, onBeforeLift])

  if (process.env.NODE_ENV !== 'production') {
    if (typeof children === 'function' && loading)
      console.error(
        'redux-persist: PersistGate expects either a function child or loading prop, but not both. The loading prop will be ignored.'
      )
  }
  if (typeof children === 'function') {
    return children(open)
  }
  return open ? children : loading
}

// PersistGate stays a class component: its generated types are accepted as a
// JSX component even when an app ends up with two copies of @types/react
// (#1375), which a function component's return type isn't.
export class PersistGate extends React.PureComponent<PersistGateProps> {
  static defaultProps = {
    children: null,
    loading: null,
  }

  render(): ReactNode {
    return React.createElement(Gate, this.props)
  }
}
