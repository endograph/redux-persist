// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { PureComponent, ReactNode } from 'react'
import type { Persistor } from '../types'

type Props = {
  onBeforeLift?: () => void,
  children: ReactNode | ((state: boolean) => ReactNode),
  loading: ReactNode,
  persistor: Persistor,
}

type State = {
  bootstrapped: boolean,
}

export class PersistGate extends PureComponent<Props, State> {
  static defaultProps = {
    children: null,
    loading: null,
  }

  state = {
    bootstrapped: false,
  }
  _unsubscribe?: () => void

  componentDidMount(): void {
    this._unsubscribe = this.props.persistor.subscribe(
      this.handlePersistorState
    )
    this.handlePersistorState()
  }

  handlePersistorState = (): void => {
    const { persistor } = this.props
    const { bootstrapped } = persistor.getState()
    if (bootstrapped) {
      if (this.props.onBeforeLift) {
        Promise.resolve(this.props.onBeforeLift())
          .finally(() => this.setState({ bootstrapped: true }))
      } else {
        this.setState({ bootstrapped: true })
      }
      this._unsubscribe && this._unsubscribe()
    }
  }

  componentWillUnmount(): void {
    this._unsubscribe && this._unsubscribe()
  }

  render(): ReactNode {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof this.props.children === 'function' && this.props.loading)
        console.error(
          'redux-persist: PersistGate expects either a function child or loading prop, but not both. The loading prop will be ignored.'
        )
    }
    if (typeof this.props.children === 'function') {
      return this.props.children(this.state.bootstrapped)
    }

    return this.state.bootstrapped ? this.props.children : this.props.loading
  }
}
