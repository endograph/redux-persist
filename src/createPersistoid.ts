/* eslint-disable @typescript-eslint/no-explicit-any */
import { KEY_PREFIX } from './constants.js'
import createKeyFilter from './keyFilter.js'

import type { Persistoid, PersistConfig } from './types.js'
import { KeyAccessState } from './types.js'

export default function createPersistoid(
  config: PersistConfig<any>,
  // A write still in flight from a writer this one replaces (replaceReducer).
  // This writer's writes wait for it, so the older write can't land last.
  previousWrite?: Promise<any> | null
): Persistoid {
  // defaults
  // _persist is always written, even when the allowlist doesn't list it
  const passesKeyFilter = createKeyFilter(config, `persist config "${config.key}"`, ['_persist'])
  const transforms = config.transforms || []
  const throttle = config.throttle || 0
  const storageKey = `${
    config.keyPrefix !== undefined ? config.keyPrefix : KEY_PREFIX
  }${config.key}`
  const storage = config.storage
  let serialize: (x: any) => any
  if (config.serialize === false) {
    serialize = (x: any) => x
  } else if (typeof config.serialize === 'function') {
    serialize = config.serialize
  } else {
    serialize = defaultSerialize
  }
  const writeFailHandler = config.writeFailHandler || null

  // initialize stateful values
  let waitFor: Promise<any> | null = previousWrite || null
  if (waitFor) {
    const done = () => { waitFor = null }
    waitFor.then(done, done)
  }
  let lastState: KeyAccessState = {}
  const stagedState: KeyAccessState = {}
  const keysToProcess: string[] = []
  let writeTimeout: any = null
  let writePromise: Promise<any> | null = null

  const update = (state: KeyAccessState) => {
    // add any changed keys to the queue
    Object.keys(state).forEach(key => {
      if (!passesKeyFilter(key)) return // is keyspace ignored? noop
      if (lastState[key] === state[key]) return // value unchanged? noop
      if (keysToProcess.indexOf(key) !== -1) return // is key already queued? noop
      keysToProcess.push(key) // add key to queue
    })

    //if any key is missing in the new state which was present in the lastState,
    //add it for processing too
    Object.keys(lastState).forEach(key => {
      if (
        state[key] === undefined &&
        passesKeyFilter(key) &&
        keysToProcess.indexOf(key) === -1 &&
        lastState[key] !== undefined
      ) {
        keysToProcess.push(key)
      }
    })

    // start the time iterator if not running (read: throttle)
    if (writeTimeout === null) {
      writeTimeout = setTimeout(flush, throttle)
    }

    lastState = state
  }

  function processNextKey() {
    if (keysToProcess.length === 0) {
      return
    }

    const key: any = keysToProcess.shift()
    if (key === undefined) {
      return
    }
    const endState = transforms.reduce((subState, transformer) => {
      return transformer.in(subState, key, lastState)
    }, lastState[key])

    if (endState !== undefined) {
      try {
        stagedState[key] = serialize(endState)
      } catch (err) {
        console.error(
          'redux-persist/createPersistoid: error serializing state',
          err
        )
      }
    } else {
      //if the endState is undefined, no need to persist the existing serialized content
      delete stagedState[key]
    }

    if (keysToProcess.length === 0) {
      writeStagedState()
    }
  }

  function writeStagedState() {
    // cleanup any removed keys just before write.
    Object.keys(stagedState).forEach(key => {
      if (lastState[key] === undefined) {
        delete stagedState[key]
      }
    })

    let serialized: any
    try {
      serialized = serialize(stagedState)
    } catch (err) {
      onWriteFail(err)
      return
    }

    const write = () => storage.setItem(storageKey, serialized)
    // only defer while the previous writer's write is pending, so writes stay
    // synchronous otherwise (flush() in beforeunload relies on that)
    writePromise = (waitFor ? waitFor.then(write, write) : write()).catch(onWriteFail)
  }


  function onWriteFail(err: any) {
    // @TODO add fail handlers (typically storage full)
    if (writeFailHandler) writeFailHandler(err)
    if (err && process.env.NODE_ENV !== 'production') {
      console.error('Error storing data', err)
    }
  }

  function flush() {
    // Clear the pending timer first: if a transform or serializer throws below,
    // the next update must still be able to schedule a write.
    if (writeTimeout) {
      clearTimeout(writeTimeout)
      writeTimeout = null
    }

    while (keysToProcess.length !== 0) {
      processNextKey()
    }

    // A replacement may not have written yet, but flush (and the next
    // replacement) must still wait for the write inherited from its predecessor.
    return writePromise || waitFor || Promise.resolve()
  }

  // return `persistoid`
  return {
    update,
    flush,
  }
}

// @NOTE in the future this may be exposed via config
function defaultSerialize(data: any) {
  return JSON.stringify(data)
}
