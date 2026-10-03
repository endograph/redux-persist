import * as ReactModule from 'react'
import type { ReactNode } from 'react'

// Node's native ESM loader can't see the named exports of React's CommonJS
// build before 16.13, but the module's default export is the whole module.
const React: typeof ReactModule =
  (ReactModule as unknown as { default?: typeof ReactModule }).default || ReactModule
import type { Persistor } from '../types.js'

/**
 * Returns whether the persistor has finished loading stored state, and
 * re-renders when it does. Needs React 16.8+.
 */
export function useRehydrated(persistor: Persistor): boolean {
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

type State = {
  bootstrapped: boolean,
}

// PersistGate stays a class component: its generated types are accepted as a
// JSX component even when an app ends up with two copies of @types/react
// (#1375), which a function component's return type isn't.
export class PersistGate extends React.PureComponent<PersistGateProps, State> {
  static defaultProps = {
    children: null,
    loading: null,
  }

  state: State
  _unsubscribe?: () => void
  _mounted = false
  // onBeforeLift runs once, even when StrictMode mounts the component twice
  _beforeLift?: Promise<void>

  constructor(props: PersistGateProps) {
    super(props)
    // already loaded with nothing to wait for: render children on the first
    // render instead of flashing `loading` (#1070)
    this.state = {
      bootstrapped: props.persistor.getState().bootstrapped && !props.onBeforeLift,
    }
  }

  componentDidMount(): void {
    this._mounted = true
    this._unsubscribe = this.props.persistor.subscribe(this.handlePersistorState)
    this.handlePersistorState()
  }

  handlePersistorState = (): void => {
    if (this.state.bootstrapped || !this.props.persistor.getState().bootstrapped) return
    this._unsubscribe && this._unsubscribe()

    const { onBeforeLift } = this.props
    if (!onBeforeLift) {
      this.setState({ bootstrapped: true })
      return
    }
    if (!this._beforeLift)
      this._beforeLift = Promise.resolve()
        .then(() => onBeforeLift())
        .catch(err => {
          if (process.env.NODE_ENV !== 'production')
            console.error('redux-persist: onBeforeLift failed; lifting PersistGate anyway.', err)
        })
    this._beforeLift.then(() => {
      if (this._mounted) this.setState({ bootstrapped: true })
    })
  }

  componentWillUnmount(): void {
    this._mounted = false
    this._unsubscribe && this._unsubscribe()
  }

  render(): ReactNode {
    const { children, loading } = this.props
    if (process.env.NODE_ENV !== 'production') {
      if (typeof children === 'function' && loading)
        console.error(
          'redux-persist: PersistGate expects either a function child or loading prop, but not both. The loading prop will be ignored.'
        )
    }
    if (typeof children === 'function') {
      return children(this.state.bootstrapped)
    }

    return this.state.bootstrapped ? children : loading
  }
}
