# Transforms
Transforms allow you to customize the state object that gets persisted and rehydrated.

There are several libraries that tackle some common implementations for transforms.
- [immutable](https://github.com/rt2zz/redux-persist-transform-immutable) - support immutable reducers
- [seamless-immutable](https://github.com/hilkeheremans/redux-persist-seamless-immutable) - support seamless-immutable reducers
- [compress](https://github.com/rt2zz/redux-persist-transform-compress) - compress your serialized state with lz-string
- [encrypt](https://github.com/maxdeviant/redux-persist-transform-encrypt) - encrypt your serialized state with AES
- [filter](https://github.com/edy/redux-persist-transform-filter) - store or load a subset of your state
- [filter-immutable](https://github.com/actra-development/redux-persist-transform-filter-immutable) - store or load a subset of your state with support for immutablejs
- [expire](https://github.com/gabceb/redux-persist-transform-expire) - expire a specific subset of your state based on a property
- [expire-reducer](https://github.com/kamranahmedse/redux-persist-expire) - more flexible alternative to expire transformer above with more options

When the state object gets persisted, it first gets serialized with `JSON.stringify()`. If parts of your state object are not mappable to JSON objects, the serialization process may transform these parts of your state in unexpected ways. For example, the javascript [Set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set) type does not exist in JSON. When you try to serialize a Set via `JSON.stringify()`, it gets converted to an empty object. Probably not what you want.

The `inboundState` and `outboundState` passed to a transform are not the whole state: each is the sub-state of one top-level key (the `key` argument), and the value the transform returns becomes the state stored for, or restored to, that key. A transform runs for every top-level key that passes its `allowlist`/`denylist` (a list of keys, or a function called with each key).

Below is a Transform that successfully persists a Set property, which simply converts it to an array and back. In this way, the Set gets converted to an Array, which is a recognized data structure in JSON. When pulled out of the persisted store, the array gets converted back to a Set before being saved to the redux store.

```js
import { createTransform } from 'redux-persist';

const SetTransform = createTransform(
  // transform state on its way to being serialized and persisted.
  (inboundState, key) => {
    // convert mySet to an Array.
    return { ...inboundState, mySet: [...inboundState.mySet] };
  },
  // transform state being rehydrated
  (outboundState, key) => {
    // convert mySet back to a Set.
    return { ...outboundState, mySet: new Set(outboundState.mySet) };
  },
  // define which reducers this transform gets called for.
  { allowlist: ['someReducer'] }
);

export default SetTransform;
```

The `createTransform` function takes three parameters.
1. An "inbound" function that gets called right before state is persisted (optional).
2. An "outbound" function that gets called right before state is rehydrated (optional).
3. A config object that determines which keys in your state will be transformed (by default no keys are transformed).

In order to take effect transforms need to be added to a `PersistReducer`’s config object.

```
import storage from 'redux-persist/storage';
import { SetTransform } from './transforms';

const persistConfig = {
  key: 'root',
  storage: storage,
  transforms: [SetTransform]
};
```

