import type z from "zod";
import type {
  accountsSchema,
  blockEngineSchema,
  gossipSchema,
  peersSchema,
  slotSchema,
  summarySchema,
  supermajoritySchema,
} from "../entities";
import type { GossipHealthEma } from "../atoms";
import type { Epoch } from "../types";
import type { LiveShredsData } from "./cache/shreds/types";

type KvFrom<TSchema extends z.core.$ZodType, TTopic extends string> =
  z.infer<TSchema> extends infer U
    ? U extends { key: infer K; value: infer V }
      ? { topic: TTopic; key: K & string; value: V }
      : never
    : never;

/** Frame of the early socket (binaryType arraybuffer, so never Blob) */
export type EarlyWsFrame = string | ArrayBuffer;

export type ToWorkerMessage =
  | { type: "connect"; websocketUrl: string; compress: boolean }
  // early-socket adoption (earlyWs.ts): the blob worker spawned by
  // index.html owns the socket and pumps frames to wsWorker over the
  // transferred port
  | {
      type: "adopt";
      websocketUrl: string;
      compress: boolean;
      port: MessagePort;
    }
  | { type: "disconnect" }
  | { type: "send"; value: unknown }
  // offscreen shreds chart: forward slot:live_shreds values directly to
  // the chart worker over this port (main thread bypassed)
  | { type: "shredsPort"; port: MessagePort }
  // main-thread charts in use (boot page always; Overview fallbacks):
  // keep posting slot:live_shreds in kvbs even once the validator runs
  | { type: "mainShreds"; enabled: boolean };

/**
 * Port protocol between the early blob worker (earlyWsWorker.ts, socket
 * owner) and wsWorker in adopted mode. The negotiated subprotocol is
 * only known once open, so it rides adopt-open.
 */
export type EarlyPortMessage =
  | { type: "adopt-open"; protocol: string }
  | { type: "frame"; data: EarlyWsFrame }
  | { type: "adopt-closed" };

/** Adopt-mode requests from wsWorker back to the blob worker */
export type EarlyPortRequest =
  | { type: "ws-send"; data: string }
  | { type: "close-early" };

export type WsEntity =
  | KvFrom<typeof summarySchema, "summary">
  // epoch.new posted with leader_slots filled (epochLeaderSlots.ts)
  | { topic: "epoch"; key: "new"; value: Epoch }
  | KvFrom<typeof gossipSchema, "gossip">
  | KvFrom<typeof peersSchema, "peers">
  | KvFrom<typeof slotSchema, "slot">
  | KvFrom<typeof blockEngineSchema, "block_engine">
  | KvFrom<typeof supermajoritySchema, "wait_for_supermajority">
  | KvFrom<typeof accountsSchema, "accounts">;

export type FromWorkerMessage =
  | { type: "connecting" }
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "kvb"; items: WsEntity[] }
  | ({ type: "kv" } & WsEntity)
  // worker-side shreds cache snapshot, posted when a fallback chart
  // re-enables the main feed mid-session (mainShreds)
  | { type: "shredsSeed"; data: LiveShredsData }
  // batch publisher caches
  | { type: "ema"; items: EmaItem[] }
  | {
      type: "emaHistoryArray";
      items: KeyedValuesWithHistory<EmaHistoryArrayKey>[];
    }
  | { type: "historyArray"; items: KeyedValuesWithHistory<HistoryArrayKey>[] }
  | {
      type: "emaHistoryObject";
      items: EmaObjectItem<Record<string, number>, string>[];
    };

export interface EmaItem {
  key: string;
  value: number;
}

export type HistoryEntry = { ts: number; values: number[] };

export type ObjectHistoryEntry<T> = { ts: number; value: T };

export interface ValuesWithHistory {
  /** latest values */
  values: number[];
  history: HistoryEntry[];
}

/** Keys of emaHistoryArray cache */
export type EmaHistoryArrayKey = never;

/** Keys of historyArray cache */
export type HistoryArrayKey =
  | "tileTimers"
  | "liveNetworkMetricsIngress"
  | "liveNetworkMetricsEgress";

export interface KeyedValuesWithHistory<K extends string>
  extends ValuesWithHistory {
  key: K;
}

export interface EmaObjectItem<
  T extends Record<string, number>,
  K extends string,
> {
  key: K;
  value: T;
  history: ObjectHistoryEntry<T>[];
}

/** Maps each emaHistoryObject cache key to its object type */
export type EmaHistoryObjectRegistry = {
  gossipHealth: GossipHealthEma;
};

/** Narrows an emaHistoryObject item by key */
export function isEmaObjectKey<K extends keyof EmaHistoryObjectRegistry>(
  item: EmaObjectItem<Record<string, number>, string>,
  key: K,
): item is EmaObjectItem<EmaHistoryObjectRegistry[K], K> {
  return item.key === key;
}

export interface ValidatorState {
  serverTimeNanos: number | undefined;
  isStartup: boolean | undefined;
}

export const defaultValidatorState: ValidatorState = {
  serverTimeNanos: undefined,
  isStartup: undefined,
};

// only one entry for live shreds
export const liveShredsKey = "liveShreds";
export type LiveShredsKey = typeof liveShredsKey;
export interface LiveShredsItem {
  key: LiveShredsKey;
  data: LiveShredsData;
}
