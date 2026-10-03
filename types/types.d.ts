declare module "redux-persist/es/types" {
  import { StoreEnhancer } from "redux";

  interface PersistState {
    version: number;
    rehydrated: boolean;
  }

  type PersistedState = {
    _persist: PersistState;
  } | undefined;

  type PersistMigrate =
    (state: PersistedState, currentVersion: number) => Promise<PersistedState>;

  type StateReconciler<S> =
    (inboundState: any, state: S, reducedState: S, config: PersistConfig<S>) => S;

  /**
   * @desc
   * `HSS` means HydratedSubState
   * `ESS` means EndSubState
   * `S` means State
   * `RS` means RawState
   */
  interface PersistConfig<S, RS = any, HSS = any, ESS = any> {
    version?: number;
    storage: Storage;
    key: string;
    /**
     * @deprecated keyPrefix is going to be removed in v6.
     */
    keyPrefix?: string;
    blacklist?: Array<string>;
    whitelist?: Array<string>;
    transforms?: Array<Transform<HSS, ESS, S, RS>>;
    throttle?: number;
    migrate?: PersistMigrate;
    stateReconciler?: false | StateReconciler<S>;
    /**
     * @desc Used for migrations.
     */
    getStoredState?: (config: PersistConfig<S, RS, HSS, ESS>) => Promise<PersistedState>;
    debug?: boolean;
    serialize?: boolean;
    timeout?: number;
    writeFailHandler?: (err: Error) => void;
  }

  interface PersistorOptions {
    enhancer?: StoreEnhancer<any>;
    manualPersist?: boolean;
  }

  interface Storage {
    getItem(key: string, ...args: Array<any>): any;
    setItem(key: string, value: any, ...args: Array<any>): any;
    removeItem(key: string, ...args: Array<any>): any;
  }

  interface WebStorage extends Storage {
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

  interface MigrationManifest {
    [key: string]: (state: PersistedState) => PersistedState;
  }

  /**
   * @desc
   * `SS` means SubState
   * `ESS` means EndSubState
   * `S` means State
   */
  type TransformInbound<SS, ESS, S = any> =
    (subState: SS, key: keyof S, state: S) => ESS;

  /**
   * @desc
   * `SS` means SubState
   * `HSS` means HydratedSubState
   * `RS` means RawState
   */
  type TransformOutbound<SS, HSS, RS = any> =
    (state: SS, key: keyof RS, rawState: RS) => HSS;

  interface Transform<HSS, ESS, S = any, RS = any> {
    in: TransformInbound<HSS, ESS, S>;
    out: TransformOutbound<ESS, HSS, RS>;
  }

  type RehydrateErrorType = any;

  interface RehydrateAction {
    type: 'persist/REHYDRATE';
    key: string;
    payload?: object | null;
    err?: RehydrateErrorType | null;
  }

  interface Persistoid {
    update(state: object): void;
    flush(): Promise<any>;
  }

  interface RegisterAction {
    type: 'persist/REGISTER';
    key: string;
  }

  type PersistorAction =
    | RehydrateAction
    | RegisterAction
  ;

  interface PersistorState {
    registry: Array<string>;
    bootstrapped: boolean;
  }

  type PersistorSubscribeCallback = () => any;

  /**
   * A persistor is a redux store unto itself, allowing you to purge stored state, flush all
   * pending state serialization and immediately write to disk
   */
  interface Persistor {
    pause(): void;
    persist(): void;
    purge(): Promise<any>;
    flush(): Promise<any>;
    dispatch(action: PersistorAction): PersistorAction;
    getState(): PersistorState;
    subscribe(callback: PersistorSubscribeCallback): () => any;
  }
}

declare module "redux-persist/lib/types" {
  export * from "redux-persist/es/types";
}
