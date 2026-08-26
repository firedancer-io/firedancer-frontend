import * as z from "zod/mini";
import {
  accountsSchema,
  blockEngineSchema,
  epochSchema,
  gossipSchema,
  peersSchema,
  slotSchema,
  summarySchema,
  supermajoritySchema,
} from "../entities";

// Lives apart from types.ts so the main thread can import runtime values
// from types.ts without pulling zod and the entity schemas into its bundle.
export const WsMessageSchema = z.discriminatedUnion("topic", [
  summarySchema,
  epochSchema,
  gossipSchema,
  peersSchema,
  slotSchema,
  blockEngineSchema,
  supermajoritySchema,
  accountsSchema,
]);

export type WsMessage = z.infer<typeof WsMessageSchema>;
