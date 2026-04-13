import z from "zod";
import {
  blockEngineSchema,
  epochSchema,
  gossipSchema,
  peersSchema,
  slotSchema,
  summarySchema,
  supermajoritySchema,
} from "../entities";
import type { GossipHealthEma } from "../atoms";

export const WsMessageSchema = z.discriminatedUnion("topic", [
  summarySchema,
  epochSchema,
  gossipSchema,
  peersSchema,
  slotSchema,
  blockEngineSchema,
  supermajoritySchema,
]);

export type WsMessage = z.infer<typeof WsMessageSchema>;

type KvFrom<TSchema extends z.ZodTypeAny, TTopic extends string> =
  z.infer<TSchema> extends infer U
    ? U extends { key: infer K; value: infer V }
      ? { topic: TTopic; key: K & string; value: V }
      : never
    : never;

export type ToWorkerMessage =
  | { type: "connect"; websocketUrl: string; compress: boolean }
  | { type: "disconnect" }
  | { type: "send"; value: unknown };

export type WsEntity =
  | KvFrom<typeof summarySchema, "summary">
  | KvFrom<typeof epochSchema, "epoch">
  | KvFrom<typeof gossipSchema, "gossip">
  | KvFrom<typeof peersSchema, "peers">
  | KvFrom<typeof slotSchema, "slot">
  | KvFrom<typeof blockEngineSchema, "block_engine">
  | KvFrom<typeof supermajoritySchema, "wait_for_supermajority">;

export type FromWorkerMessage =
  | { type: "connecting" }
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "kvb"; items: WsEntity[] }
  | ({ type: "kv" } & WsEntity)
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
export type EmaHistoryArrayKey = "ingress" | "egress";

/** Keys of historyArray cache */
export type HistoryArrayKey = "tileTimers";

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
