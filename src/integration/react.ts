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

// Stored state only loads in the browser, so a server render always shows it
// as not loaded yet, and hydrating that HTML has to start from the same value
// (#1452). React uses this while hydrating, then updates to the real value.
const getServerSnapshot = () => false

/**
 * Returns whether the persistor has finished loading stored state, and
 * re-renders when it does. Needs React 16.8+. With React 18+ it's safe for
 * server rendering: on the server and while hydrating it returns false.
 */
export function useRehydrated(persistor: Persistor): boolean {
  // which hook runs depends only on the React version, never between renders
  return useSyncExternalStore
    ? useSyncExternalStore(persistor.subscribe, () => persistor.getState().bootstrapped, getServerSnapshot)
    : useRehydratedWithEffect(persistor)
}

// React 16.8 and 17, which have no useSyncExternalStore
function useRehydratedWithEffect(persistor: Persistor): boolean {
  // Read from the current persistor on every render, so switching persistors
  // never reports the previous one's status; state only triggers re-renders.
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
  const lifted = React.useRef(false)
  if (bootstrapped && (!onBeforeLift || beforeLiftDone)) lifted.current = true

  React.useEffect(() => {
    if (!bootstrapped || !onBeforeLift || lifted.current) return
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
  }, [bootstrapped, onBeforeLift])

  if (process.env.NODE_ENV !== 'production') {
    if (typeof children === 'function' && loading)
      console.error(
        'redux-persist: PersistGate expects either a function child or loading prop, but not both. The loading prop will be ignored.'
      )
  }
  if (typeof children === 'function') {
    return children(lifted.current)
  }
  return lifted.current ? children : loading
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
