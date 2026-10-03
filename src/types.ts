/* eslint-disable @typescript-eslint/no-explicit-any */
import { REHYDRATE, REGISTER } from './constants'

import { StoreEnhancer } from "redux";

export interface PersistState {
  version: number;
  rehydrated: boolean;
}

export type PersistedState = {
  _persist: PersistState;
} | undefined;

export type PersistMigrate =
  (state: PersistedState, currentVersion: number) => Promise<PersistedState>;

export type StateReconciler<S> =
  (inboundState: any, state: S, reducedState: S, config: PersistConfig<S>) => S;

export interface KeyAccessState {
  [key: string]: any;
}

/**
 * @desc
 * `HSS` means HydratedSubState
 * `ESS` means EndSubState
 * `S` means State
 * `RS` means RawState
 */
export interface PersistConfig<S, RS = any, HSS = any, ESS = any> {
  version?: number;
  storage: Storage;
  key: string;
  /**
   * @deprecated keyPrefix is going to be removed in v6.
   */
  keyPrefix?: string;
  /**
   * Only persist these top-level state keys.
   */
  allowlist?: ReadonlyArray<keyof S & string>;
  /**
   * Don't persist these top-level state keys.
   */
  denylist?: ReadonlyArray<keyof S & string>;
  /**
   * @deprecated Use `allowlist`, which is checked against your state's keys.
   */
  whitelist?: ReadonlyArray<string>;
  /**
   * @deprecated Use `denylist`, which is checked against your state's keys.
   */
  blacklist?: ReadonlyArray<string>;
  transforms?: Array<Transform<HSS, ESS, S, RS>>;
  throttle?: number;
  migrate?: PersistMigrate;
  stateReconciler?: false | StateReconciler<S>;
  /**
   * @desc Used for migrations.
   */
  getStoredState?: (config: PersistConfig<S, RS, HSS, ESS>) => Promise<PersistedState>;
  debug?: boolean;
  serialize?: boolean | ((data: any) => any);
  deserialize?: boolean | ((x: any) => any);
  timeout?: number;
  writeFailHandler?: (err: Error) => void;
}

export interface PersistorOptions {
  enhancer?: StoreEnhancer<any>;
  manualPersist?: boolean;
}

export interface Storage {
  getItem(key: string, ...args: Array<any>): any;
  setItem(key: string, value: any, ...args: Array<any>): any;
  removeItem(key: string, ...args: Array<any>): any;
  keys?: Array<string>;
  getAllKeys(cb?: any): any;
}

export interface WebStorage extends Storage {
  /**
   * @desc Fetches key and returns item in a promise.
   */
  getItem(key: string): Promise<string | null>;
  /**
   * @desc Sets value for key and returns item in a promise.
   */
  setItem(key: string, item: string): Promise<void>;
  /**
   * @desc Removes value for key.
   */
  removeItem(key: string): Promise<void>;
}

/**
 * Each migration receives the stored state from the previous version and returns
 * the state for its version, or a promise of it. Shapes usually differ between
 * versions, so state is untyped by default; pass `S` to type every step.
 */
export interface MigrationManifest<S = any> {
  [key: string]: (state: S) => S | Promise<S>
}

/**
 * @desc
 * `SS` means SubState
 * `ESS` means EndSubState
 * `S` means State
 */
export type TransformInbound<SS, ESS, S = any> =
  (subState: SS, key: keyof S, state: S) => ESS;

/**
 * @desc
 * `SS` means SubState
 * `HSS` means HydratedSubState
 * `RS` means RawState
 */
export type TransformOutbound<SS, HSS, RS = any> =
  (state: SS, key: keyof RS, rawState: RS) => HSS;

export interface Transform<HSS, ESS, S = any, RS = any> {
  in: TransformInbound<HSS, ESS, S>;
  out: TransformOutbound<ESS, HSS, RS>;
}

export type RehydrateErrorType = any;

export interface RehydrateAction {
  type: typeof REHYDRATE;
  key: string;
  payload?: object | null;
  err?: RehydrateErrorType | null;
}

export interface Persistoid {
  update(state: object): void;
  flush(): Promise<any>;
}

export interface RegisterAction {
  type: typeof REGISTER;
  key: string;
}

export type PersistorAction =
  | RehydrateAction
  | RegisterAction
;

export interface PersistorState {
  registry: Array<string>;
  bootstrapped: boolean;
}

export type PersistorSubscribeCallback = () => any;

/**
 * A persistor is a redux store unto itself, allowing you to purge stored state, flush all
 * pending state serialization and immediately write to disk
 */
export interface Persistor {
  pause(): void;
  persist(): void;
  purge(): Promise<any>;
  flush(): Promise<any>;
  dispatch(action: PersistorAction): PersistorAction;
  getState(): PersistorState;
  subscribe(callback: PersistorSubscribeCallback): () => any;
}
