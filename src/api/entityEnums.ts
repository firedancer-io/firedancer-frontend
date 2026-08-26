// Runtime enum values shared by the main thread and the ws worker.
// Deliberately zod-free: entities.ts derives its schemas from these, so
// main-thread modules can use the values without pulling the zod runtime
// into the main bundle.

export const ClientEnum = {
  Frankendancer: "Frankendancer",
  Firedancer: "Firedancer",
} as const;

export const ScheduleStrategyEnum = {
  perf: "perf",
  balanced: "balanced",
  revenue: "revenue",
} as const;

export const TILE_TYPES = [
  "sock",
  "net",
  "mlx5",
  "quic",
  "bundle",
  "verify",
  "dedup",
  "resolv", // Firedancer
  "resolh", // Frankendancer
  "pack",
  "execle", // Firedancer
  "bank", // Frankendancer
  "poh", // Firedancer
  "pohh", // Frankendancer
  "shred",
  "store",

  // snapshot
  "snapct",
  "snapld",
  "snapdc",
  "snapin",
  "snapwr",

  // shred tiles
  "netlnk",
  "metric",
  "ipecho",
  "gossvf",
  "gossip",
  "repair",
  "replay",
  "execrp",
  "tower",
  "txsend",
  "sign",
  "rpc",
  "gui",

  // others
  "http",
  "plugin",
  "genesi",
  "diag",
  "event",
] as const;

export const PriorityEnum = {
  floating: "floating",
  startup: "startup",
  normal: "normal",
  critical: "critical",
} as const;

export const BootPhaseEnum = {
  joining_gossip: "joining_gossip",
  loading_full_snapshot: "loading_full_snapshot",
  loading_incremental_snapshot: "loading_incremental_snapshot",
  catching_up: "catching_up",
  waiting_for_supermajority: "waiting_for_supermajority",
  running: "running",
} as const;

export enum ShredEvent {
  shred_repair_request = 0,
  shred_received_turbine = 1,
  shred_received_repair = 2,
  shred_replayed = 3,
  slot_complete = 4,
  shred_published = 6,
}

export const SHRED_EVENT_TYPES_COUNT = Object.values(ShredEvent).filter(
  (v) => typeof v === "number",
).length;

export const PartitionTier = { Hot: 0, Warm: 1, Cold: 2, Off: 255 } as const;

export const CompactionState = { Idle: 0, Queued: 1, Compacting: 2 } as const;
