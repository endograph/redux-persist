/* eslint-disable @typescript-eslint/no-explicit-any */
import createKeyFilter from './keyFilter'
import type { KeyFilterConfig } from './keyFilter'
import type { Transform, TransformInbound, TransformOutbound } from './types'

// allowlist/denylist pick the top-level keys the transform applies to
type TransformConfig = KeyFilterConfig

export default function createTransform<HSS, ESS, S = any, RS = any>(
  // @NOTE inbound: transform state coming from redux on its way to being serialized and stored
  inbound?: TransformInbound<HSS, ESS, S> | null,
  // @NOTE outbound: transform state coming from storage, on its way to be rehydrated into redux
  outbound?: TransformOutbound<ESS, HSS, RS> | null,
  config: TransformConfig = {}
): Transform<HSS, ESS, S, RS> {
  const appliesTo = createKeyFilter(config, 'createTransform config')

  // Keys skipped by allowlist/denylist pass through unchanged
  return {
    in: (state: HSS, key: keyof S, fullState: S): ESS =>
      appliesTo(key as string) && inbound
        ? inbound(state, key, fullState)
        : (state as any),
    out: (state: ESS, key: keyof RS, fullState: RS): HSS =>
      appliesTo(key as string) && outbound
        ? outbound(state, key, fullState)
        : (state as any),
  }
}
