export interface BookOrder {
  /** Created quantity */
  // _q?: number;
  /** Total quantity active */
  tq?: number;
  /** Count of orders active */
  // ct?: number;
  /** Pending new quantity */
  nq?: number;
  /** Pending cancel quantity */
  cq?: number;
  /** Rejected quantity */
  rq?: number;
  /** Filled quantity */
  fq?: number;
  /** Filled satoshi qty in last 300ms */
  fl?: number;
}

export interface BookLevel {
  /** Book price */
  pr: number;
  /** Book quantity sell */
  qs?: number;
  /** Book quantity buy */
  qb?: number;
  /** Last trade sell */
  ts?: number;
  /** Last trade buy */
  tb?: number;
  /** Order sell */
  os?: BookOrder;
  /** Order buy */
  ob?: BookOrder;
  gapLength?: number;
  /** Daily buy volume */
  vb?: number;
  /** Daily sell volume */
  vs?: number;
  /** Notional qty */
  qn?: number;
}

export interface BookStackerModeOrder {
  /** Bookstacker order price */
  pr: number;
  /** Bookstacker order quantity */
  tq: number;
}

export enum ServerMessageType {
  BookLevels = "sn",
  GatewayEvents = "ga",
  GatewayOrdersSnapshot = "gn",
  GatewayRejectsCache = "gr",
  GatewayStatus = "gs",
  GatewayTradesCache = "gt",
  ServerHealth = "pt",
  Stats = "ss",
  ClickId = "id",
}

interface BaseMessage {
  /** Ladder ID */
  _i: number;
  /** Message ID */
  _n: number;
  /** Message type */
  _t: ServerMessageType;
}

interface BaseFeedbookMessage extends BaseMessage {
  _t:
    | ServerMessageType.BookLevels
    | ServerMessageType.GatewayEvents
    | ServerMessageType.GatewayOrdersSnapshot
    | ServerMessageType.GatewayRejectsCache
    | ServerMessageType.GatewayTradesCache
    | ServerMessageType.Stats
    | ServerMessageType.ClickId;
  /** Exchange code */
  cd: string;
  /** Currency code */
  cr: string;
  /** Book type, indicating coin or contract */
  bt: string;
}

export enum GWStatus {
  Init = 0,
  Running = 1,
  Disconnected = 2,
  Disabled = 3,
  ShuttingDown = 4,
  Unknown = 5,
}

export interface ServerHealthMessage extends BaseMessage {
  _t: ServerMessageType.ServerHealth;
  /** Performance timers */
  tm: {
    /** Time spent per frame across all clients and symbols (ms) */
    in: number;
    /** Idle time (ms) */
    ou: number;
    /** Idle time ratio */
    pe: number;
    /** Active users. Map of user name -> nested arrays of exchange id -> symbol id -> coalesce level */
    us?: Record<string, [number, [number, number][]][]>;
  };
}

export interface GatewayStatusMessage extends BaseMessage {
  _t: ServerMessageType.GatewayStatus;
  /** Gateway info. Nested arrays of exchange id -> gateway flavor -> [status, timestamp ns] */
  gw: [number, [number, [GWStatus, number]][]][];
}

export interface StatsMessage extends BaseFeedbookMessage {
  _t: ServerMessageType.Stats;
  /** Timestamp */
  dt: number;
  /** Book stats */
  st: {
    /** Market day high price */
    hg: {
      /** Market trade high price */
      tr: number;
      /** Trade high timestamp */
      ts: number;
    };
    /** Market day low price */
    lw: {
      /** Market trade low price */
      tr: number;
      /** Trade low timestamp */
      ts: number;
    };
    /** Total market volume */
    mv?: number;
    /** SOD price info */
    sd: {
      /** Price at SOD */
      pr: number;
      /** Price change since SOD */
      ch: number;
    };
    /** Known strategy IDs */
    ks: number[];
    /** Array of strat pnl as [strat ID, pnl] */
    pl: [number, number][];
    /** Nested arrays of strat position as [strat ID, [exchange code, [currency code, position]]] */
    ps: [number, [number, [number, number][]][]][];
    /** Total for all strats. Not included if no strats are known (`st.ks` is empty) */
    tt?: {
      /** Total pnl */
      pl: number;
      /** Total fung position (riskpool)*/
      rp: number;
      /** Total base position */
      pb: number;
      /** Total quote position */
      pq: number;
    };
    /** Current active manual order stats */
    mo: CurrentOrderMessage;
    /** 60 sec EMA of buy/sell 5bps around TOB */
    "5b": {
      /** Notional 5bps around TOB */
      nt: number;
      /** Qty 5bps around TOB */
      qt: number;
    };
    /** Bid/Ask spread in bps */
    bp?: number;
    /** Stats of selected strat */
    "1s"?: {
      /** Base fung position (riskpool)*/
      rp: number;
      /** Base position of selected strat */
      pb: number;
      /** Quote position of selected strat */
      pq: number;
    };
    /** Average entry price */
    ap?: number;
  };
}

interface CurrentOrderMessage {
  /** Count of buy order */
  cb: number;
  /** Count of sell orders */
  cs: number;
  /** Qty of buy orders */
  qb: number;
  /** Qty of sell orders */
  qs: number;
}

export interface BookLevelsMessage extends BaseFeedbookMessage {
  _t: ServerMessageType.BookLevels;
  /** Timestamp */
  dt: number;
  /** Book levels */
  bl: Array<BookLevel>;
  /** TOB price */
  tp: {
    /** TOB ask */
    ak: number;
    /** TOB bid */
    bd: number;
  };
  /** Bookstacker orders */
  bs?: {
    /** Bookstacker ask orders */
    ak?: BookStackerModeOrder[];
    /** Bookstacker bid orders */
    bd?: BookStackerModeOrder[];
  };
  /** Hidden levels cumulative sum */
  sd?: {
    /** Number of hidden levels to TOB */
    cn: number;
    /** Cumulative notional of hidden levels to TOB */
    nt: number;
    /** Cumulative quantity of hidden levels to TOB */
    qt: number;
  };
}

export enum GatewayEventMessageType {
  ORDER_NEW = 0,
  ORDER_CANCEL = 1,
  TRADE_EXEC = 5,
  ORDER_CANCEL_REPLACE = 8, // not currently published
  NEW_ORDER_ACK = 23,
  CANCEL_ORDER_ACK = 24,
  ORDER_REJ_NEW = 26,
  ORDER_REJ_CNCL = 27,
}

export interface GatewayEventsMessage extends BaseFeedbookMessage {
  _t: ServerMessageType.GatewayEvents;
  /** Event messages */
  ev: BaseGatewayEventMessage[];
}

export interface BaseGatewayEventMessage {
  /** Timestamp */
  dt: number;
  /** Event type */
  et: GatewayEventMessageType;
  /** Extra fields based on event type */
  ex: Record<string, unknown>;
  /** Gateway flavor */
  fl: number;
  /** Order id */
  oi: number;
  /** Risk pool id */
  rp: number;
  /** Strategy id */
  si: number;
  /** Whether this refers to a manual order or action */
  mn?: true;
}

export interface GatewayEventOrderMessage extends BaseGatewayEventMessage {
  et: GatewayEventMessageType.ORDER_NEW | GatewayEventMessageType.ORDER_CANCEL;
  ex: {
    /** Original amount in order */
    oa: number;
    /** Remaining amount in order */
    ra: number;
    /** Price */
    pr: number;
    /** Is a sell order */
    sl: boolean;
  };
}

export const isOrderMessage = (
  msg: BaseGatewayEventMessage,
): msg is GatewayEventOrderMessage =>
  msg.et === GatewayEventMessageType.ORDER_NEW ||
  msg.et === GatewayEventMessageType.ORDER_CANCEL;

export const isSubmitOrder = (
  msg: BaseGatewayEventMessage,
): msg is GatewayEventOrderMessage =>
  msg.et === GatewayEventMessageType.ORDER_NEW;

export const isCancelOrder = (
  msg: BaseGatewayEventMessage,
): msg is GatewayEventOrderMessage =>
  msg.et === GatewayEventMessageType.ORDER_CANCEL;

// Copied from jlbtc/GWTypes.hpp
export enum RejectReason {
  None = 0,
  GW_ClearlyErroneous = 1,
  GW_RateLimit = 2,
  GW_InvalidOrderId = 3,
  GW_NotAcceptingNew = 4,
  GW_ExpiredContract = 5,
  GW_Risk = 6,
  GW_ConnectionError = 7,
  Exch_InsufficientFunds = 8,
  Exch_OrderNotFound = 9,
  Exch_ClearlyErroneous = 10,
  Exch_RateLimit = 11,
  Exch_Unknown = 12,
  Exch_Risk = 13,
  Exch_SystemOverload = 14,
  Exch_InvalidParam = 15,
  Exch_Unavailable = 16,
  Exch_Disconnect = 17,
  Exch_PostOnly = 18,
  GW_Unknown = 19,
  GW_PendingCancel = 20,
  Exch_InvalidApiKey = 21,
  GW_QueuedTooLong = 22,
  GW_BlockedOrderQueuedTooLong = 23,
  GW_Misc = 24,
  GW_MarketStructure = 25,
  Exch_MarketStructure = 26,
  Exch_Misc = 27,
  Exch_FailureRate = 28,
  GW_CannotRoute = 29,
  Exch_SelfFill = 30,
  Exch_TLTC = 31,
  Exch_Nonce = 32,
  Exch_BatchCrossesSelf = 33,
  GW_Timeout = 34,
  GW_TLTC = 35,
  Exch_TransactionFailed = 36,
  GW_IncorrectFlavor = 37,
  GW_UnitializedFlavor = 38,
  GW_LiquidationRisk = 39,
  GW_MaxOrderSize = 40,
  GW_MinOrderSize = 41,
  GW_MaxPotentialPositionExceededBase = 42,
  GW_MaxPotentialPositionExceededQuote = 43,
  GW_ZeroMaxPotentialPosition = 44,
  GW_PendingExecution = 45,
  GW_ContractsNotSupported = 46,
  GW_AggressiveWouldCross = 47,
  Exch_MarketUnavailable = 48,
  GW_IngressDelay = 49,
  GW_OrderTooOld = 50,
  Exch_ReduceOnly = 51,
  GW_OrderNotFound = 52,
  Exch_OutsideRecvWindow = 53,
}

export interface GatewayEventOrderRejectMessage
  extends BaseGatewayEventMessage {
  et:
    | GatewayEventMessageType.ORDER_REJ_NEW
    | GatewayEventMessageType.ORDER_REJ_CNCL;
  ex: {
    /** Original amount in order */
    oa: number;
    /** Remaining amount in order */
    ra: number;
    /** Price */
    pr: number;
    /** Is a sell order */
    sl: boolean;
    /** Reject reason code */
    rr?: RejectReason;
    /** Reject reason text */
    rt?: string;
    /** Initiator */
    in?: string;
  };
}

export const isRejectMessage = (
  msg: BaseGatewayEventMessage,
): msg is GatewayEventOrderRejectMessage =>
  msg.et === GatewayEventMessageType.ORDER_REJ_NEW ||
  msg.et === GatewayEventMessageType.ORDER_REJ_CNCL;

export const isRejectSubmitOrderMessage = (
  msg: BaseGatewayEventMessage,
): msg is GatewayEventOrderRejectMessage =>
  msg.et === GatewayEventMessageType.ORDER_REJ_NEW;

export const isPostOnlyRejectMessage = (msg: GatewayEventOrderRejectMessage) =>
  msg.ex.rr === RejectReason.Exch_PostOnly;

export const isRejectCancelOrderMessage = (
  msg: BaseGatewayEventMessage,
): msg is GatewayEventOrderRejectMessage =>
  msg.et === GatewayEventMessageType.ORDER_REJ_CNCL;

export interface GatewayEventTradeMessage extends BaseGatewayEventMessage {
  et: GatewayEventMessageType.TRADE_EXEC;
  ex: {
    /** Amount executed */
    ae: number;
    /** Price executed */
    pr: number;
    /** Is a sell order */
    sl: boolean;
    /** Order price when different from executed price */
    op?: string;
    /** Fee */
    fe?: string;
    /** Initiator */
    in?: string;
    /** Liquidity type */
    lq?: string;
  };
}

export const isTradeMessage = (
  msg: BaseGatewayEventMessage,
): msg is GatewayEventTradeMessage =>
  msg.et === GatewayEventMessageType.TRADE_EXEC;

export interface GatewayEventNewOrderAckMessage
  extends BaseGatewayEventMessage {
  et: GatewayEventMessageType.NEW_ORDER_ACK;
  ex: {
    /** Original amount */
    oa: number;
    /** Price */
    pr: number;
    /** Is a sell order */
    sl: boolean;
  };
}

export const isNewOrderAckMessage = (
  msg: BaseGatewayEventMessage,
): msg is GatewayEventNewOrderAckMessage =>
  msg.et === GatewayEventMessageType.NEW_ORDER_ACK;

export interface GatewayEventCancelOrderAckMessage
  extends BaseGatewayEventMessage {
  et: GatewayEventMessageType.CANCEL_ORDER_ACK;
  ex: {
    /** Cancel order id */
    ci: number;
  };
}

export const isCancelOrderAckMessage = (
  msg: BaseGatewayEventMessage,
): msg is GatewayEventCancelOrderAckMessage =>
  msg.et === GatewayEventMessageType.CANCEL_ORDER_ACK;

export interface CachePage<T> {
  /** Cache entries */
  ev: T[];
  /** First cache index of the page */
  ib: number;
  /** First cache index of the next page */
  in: number;
  /** Total number of entries in the cache */
  sz: number;
}

export interface GatewayRejectsCacheMessage extends BaseFeedbookMessage {
  _t: ServerMessageType.GatewayRejectsCache;
  /** One page of rejects cache entries */
  rj: CachePage<GatewayEventOrderRejectMessage>;
}

export interface GatewayTradesCacheMessage extends BaseFeedbookMessage {
  _t: ServerMessageType.GatewayTradesCache;
  /** One page of trades cache entries */
  tr: CachePage<GatewayEventTradeMessage>;
}

export interface GatewayOrdersSnapshotMessage extends BaseFeedbookMessage {
  _t: ServerMessageType.GatewayOrdersSnapshot;
  /** Orders snapshot */
  sn: {
    /** Active orders */
    ev: GatewayEventOrderMessage[];
  };
}

/** All interfaces that extend BaseMessage and represent an actual message type */
export type ServerMessage =
  | ServerHealthMessage
  | GatewayStatusMessage
  | FeedbookMessage;

/** All interfaces that extend BaseFeedbookMessage and represent an actual message type */
export type FeedbookMessage =
  | BookLevelsMessage
  | GatewayEventsMessage
  | GatewayOrdersSnapshotMessage
  | GatewayRejectsCacheMessage
  | GatewayTradesCacheMessage
  | StatsMessage
  | ClickIdMessage;

export function isFeedbookMessage(
  message: ServerMessage,
): message is FeedbookMessage {
  return (
    message._t === ServerMessageType.BookLevels ||
    message._t === ServerMessageType.GatewayEvents ||
    message._t === ServerMessageType.GatewayOrdersSnapshot ||
    message._t === ServerMessageType.GatewayRejectsCache ||
    message._t === ServerMessageType.GatewayTradesCache ||
    message._t === ServerMessageType.Stats ||
    message._t === ServerMessageType.ClickId
  );
}

export interface ClickIdMessage extends BaseFeedbookMessage {
  _t: ServerMessageType.ClickId;
  /** Click trade order info */
  so: {
    /** Unique int ClickId sent in corresponding SubmitOrder */
    ci: number;
    /** Order id */
    oi: number;
    /** Strat id */
    si: number;
  };
}

export type ClientMessage = unknown;

export type SendMessage = (message: ClientMessage) => void;

export enum SocketState {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
}

export interface ConnectionStatus {
  socketState: SocketState;
}
