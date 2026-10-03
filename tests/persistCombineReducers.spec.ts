import persistCombineReducers from '../src/persistCombineReducers'
import createMemoryStorage from './utils/createMemoryStorage'

import test from 'ava'

const config = {
  key: 'TestConfig',
  storage: createMemoryStorage()
}

test('persistCombineReducers returns a function', t => {
  const reducer = persistCombineReducers(config, {
    foo: () => ({})
  })

  t.is(typeof reducer, 'function')
})

/*
test.skip('persistCombineReducers merges two levels deep of state', t => {
  
})
*/
