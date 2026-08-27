import "./zstdWasmPrefetch";
import { ZstdInit, type ZstdDecoder } from "./zstdDecompress";
import { logDebug, logError, logWarning } from "../../logger";
import type {
  EarlyPortMessage,
  EarlyPortRequest,
  EarlyWsFrame,
  FromWorkerMessage,
  WsEntity,
  ToWorkerMessage,
} from "./types";
import { WsMessageSchema } from "./wsMessage";
import { createMessageHandler } from "./messageHandler";
import { fillEpochLeaderSlots } from "./epochLeaderSlots";
import { createShredsCalc } from "./cache/shreds/shredsCalc";
import { nsPerMs } from "../../consts";

const reconnectDelayMs = 3_000;
const flushDelayMs = 32; // ~30fps

// Fired at module load so wasm compile overlaps the WS handshake
const zstdPromise: Promise<ZstdDecoder | undefined> = ZstdInit().catch(
  (e: unknown) => {
    logError(
      "WS",
      "Failed to initialize Zstd, falling back to uncompressed",
      e,
    );
    return undefined;
  },
);

const ctx = self as unknown as DedicatedWorkerGlobalScope;
// nested-spawn mode: main talks over a transferred port, not ctx
let mainPort: MessagePort | null = null;
function postMain(msg: FromWorkerMessage, transfer?: Transferable[]) {
  (mainPort ?? ctx).postMessage(msg, transfer ?? []);
}
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout>;

let scheduled = false;
let batchStartedAt = 0;
const pendingBatches = new Map<string, WsEntity[]>();

/**
 * Connect-burst peers snapshot hold. The backend broadcasts the lite
 * peers frames (stats, leaders) ahead of the first peers:update, and
 * everything above the fold renders from those, so when they preceded
 * it the multi-MB snapshot (and any deltas behind it, preserving apply
 * order) is held off the boot path until both threads settle: main
 * reports bootSettled (post-reveal idle callback with nothing
 * buffered, useWsWorker.ts) and the flush timer here runs unstarved
 * (the burst decode run is over). requestPeers (gossip-route
 * navigation) releases immediately. Backends that never send the lite
 * frames (Frankendancer) never hold.
 */
let peersHeld: WsEntity[] = [];
let peersHolding = false;
let peersHoldDecided = false;
let peersLiteSeen = false;
let mainSettled = false;
let peersRequested = false;

function resetPeersHold() {
  peersHeld = [];
  peersHolding = false;
  peersHoldDecided = false;
  peersLiteSeen = false;
  mainSettled = false;
  peersRequested = false;
  revealRemaining = new Set(revealTokens);
  shredsPortTimeSent = false;
}

/**
 * First-batch fast flush: the reveal renders entirely from the connect
 * snapshot (frames through accounts:stats, ahead of the multi-MB
 * live_shreds/peers frames), but the burst decode run starves the flush
 * timer, so without this the first batch waits for the next large frame.
 * The moment every reveal-feeding key is batched, ship immediately.
 * Token set mirrors the FD connect snapshot; backends that never
 * complete it (Frankendancer) keep the timer/size/age triggers.
 */
const revealKeyTokens: Record<string, string> = {
  "summary:boot_progress": "boot",
  "summary:startup_progress": "boot",
  "summary:vote_state": "vote_state",
  "summary:tps_history": "tps_history",
  "summary:estimated_tps": "estimated_tps",
  "summary:completed_slot": "completed_slot",
  "summary:live_program_cache": "program_cache",
  "epoch:new": "epoch",
  "peers:stats": "peers_stats",
  "peers:leaders": "peers_leaders",
  "slot:skipped_history": "skipped_history",
  // columnar batch fans out to update items before reaching batch()
  "slot:update": "slots",
  "accounts:stats": "accounts",
};
const revealTokens = new Set(Object.values(revealKeyTokens));
let revealRemaining: Set<string> | null = new Set(revealTokens);

function releasePeers() {
  peersHolding = false;
  const held = peersHeld;
  peersHeld = [];
  for (const item of held) batch(item);
}

const loggedZodFailures = new Set<string>();

function getZodFailureKey(json: unknown): string | null {
  if (
    json != null &&
    typeof json === "object" &&
    "topic" in json &&
    "key" in json &&
    typeof json.topic === "string" &&
    typeof json.key === "string"
  ) {
    return `${json.topic}:${json.key}`;
  }

  return null;
}

const handler = createMessageHandler((msg) => postMain(msg));

// offscreen shreds chart port: live_shreds skip the main thread entirely
let shredsPort: MessagePort | null = null;
// one-shot serverTime bootstrap per connection/attach (steady-state
// updates keep flowing via the main thread's state relay)
let shredsPortTimeSent = false;

/**
 * Worker-side shreds cache: seeds the chart worker's port with the
 * events that arrived before it attached (the connect backlog), and
 * seeds the main atoms if a fallback chart re-enables the main feed.
 */
const shredsCalc = createShredsCalc(() => handler.getValidatorState());
// main-thread charts asked for the feed (offscreen unsupported/failed)
let mainShredsForced = false;

function enqueue(item: WsEntity) {
  handler.onMessage(item);

  if (
    !shredsPortTimeSent &&
    shredsPort &&
    item.topic === "summary" &&
    item.key === "server_time_nanos"
  ) {
    shredsPortTimeSent = true;
    shredsPort.postMessage({
      type: "serverTime",
      serverTimeMs: Math.round(item.value / nsPerMs),
    });
  }

  if (item.topic === "peers") {
    if (item.key === "update") {
      if (!peersHoldDecided) {
        peersHoldDecided = true;
        peersHolding = peersLiteSeen && !peersRequested;
      }
      if (peersHolding) {
        peersHeld.push(item);
        return;
      }
    } else {
      peersLiteSeen = true;
    }
  }

  if (item.topic === "slot" && item.key === "live_shreds") {
    shredsCalc.add(item.value);
    shredsPort?.postMessage({ type: "shreds", value: item.value });
    // once running, main only consumes shreds via fallback charts; not
    // posting the values (multi-MB on the backlog) spares main their
    // structured-clone deserialize and atom apply
    if (!mainShredsForced && handler.getValidatorState().isStartup === false)
      return;
  }

  batch(item);
}

function batch(item: WsEntity) {
  const key = `${item.topic}:${item.key}`;
  if (pendingBatches.has(key)) {
    pendingBatches.get(key)?.push(item);
  } else {
    if (!pendingBatches.size) batchStartedAt = performance.now();
    pendingBatches.set(key, [item]);
  }

  if (revealRemaining) {
    const token = revealKeyTokens[key];
    if (token) {
      revealRemaining.delete(token);
      if (!revealRemaining.size) {
        flush();
        return;
      }
    }
  }

  if (!scheduled) {
    scheduled = true;
    setTimeout(timerFlush, flushDelayMs);
  }
}

function timerFlush() {
  // An on-schedule timer run means frame decodes aren't saturating the
  // thread (handleFrame force-flushes starved batches), so with main
  // settled the burst is over and the held snapshot can ship
  if (
    peersHolding &&
    mainSettled &&
    (!pendingBatches.size ||
      performance.now() - batchStartedAt < starvedBatchMs)
  ) {
    releasePeers();
  }
  flush();
}

function flush() {
  scheduled = false;
  const items: WsEntity[] = [];
  for (const batch of pendingBatches.values()) {
    for (const item of batch) items.push(item);
  }
  pendingBatches.clear();

  if (items.length) {
    // any shipped first batch ends the fast-flush phase
    revealRemaining = null;
    // derived leader_slots move by buffer transfer (~108KB/epoch), not clone
    const transfer: ArrayBuffer[] = [];
    for (const item of items) {
      if (
        item.topic === "epoch" &&
        item.value.leader_slots instanceof Uint32Array
      )
        transfer.push(item.value.leader_slots.buffer as ArrayBuffer);
    }
    // latest kv type not implemented as everything defaults to batched kvb
    postMain({ type: "kvb", items }, transfer);
  }
}

function connect(url: string, zstd: ZstdDecoder | undefined) {
  logDebug("WS", `Connecting to API WebSocket ${url.toString()}`);
  handler.onConnectionChange({ type: "connecting" });
  ws = new WebSocket(url, zstd ? ["compress-zstd"] : undefined);
  ws.binaryType = "arraybuffer";

  ws.onopen = function onopen() {
    if (this !== ws) return;

    logDebug("WS", "Connected to API WebSocket");
    handler.onConnectionChange({ type: "connected" });
  };

  ws.onclose = function onclose() {
    if (this !== ws) return;

    logDebug(
      "WS",
      `Disconnected API WebSocket, reconnecting in ${reconnectDelayMs}ms`,
    );
    handler.onConnectionChange({ type: "disconnected" });
    shredsCalc.resetDataAndClearDeleteTimeout();
    resetPeersHold(); // reconnect brings a fresh snapshot

    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect(url, zstd), reconnectDelayMs);
  };

  ws.onmessage = function onmessage(ev: MessageEvent<unknown>) {
    if (this !== ws) return;
    handleFrame(ev.data, zstd);
  };
}

const decoder = new TextDecoder();

/**
 * Frames at least this size (wire bytes) decode long enough that the
 * already-decoded batch ships first: the connect burst opens with small
 * frames (boot, summary, epoch, leaders, slot replay, stats) followed by
 * multi-MB ones (live_shreds, peers update), and the reveal gates on the
 * first batch. Sized between the largest small frame (~31KB compressed
 * epoch:new; ~100KB on mainnet) and the multi-MB frames' wire size.
 */
const largeFrameBytes = 262_144;
/**
 * Age backstop for the in-frame flush: the burst decodes in an unbroken
 * run of message tasks that starves the flush timer, which would
 * otherwise hold the first batch until the entire backlog is through.
 * Long enough that the whole small-frame opening run (well under 250ms
 * even on slow hardware) ships as one reveal-gating batch, with the
 * size trigger as the primary splitter.
 */
const starvedBatchMs = 250;

function handleFrame(message: unknown, zstd: ZstdDecoder | undefined) {
  // Ship the pending batch before starting a large decode, and whenever
  // the flush timer has been starved well past its cadence. Frames
  // decode in arrival order; flushing early only makes batches smaller,
  // never reordered.
  if (pendingBatches.size) {
    const bytes =
      typeof message === "string"
        ? message.length
        : message instanceof ArrayBuffer
          ? message.byteLength
          : 0;
    if (
      bytes >= largeFrameBytes ||
      performance.now() - batchStartedAt >= starvedBatchMs
    ) {
      flush();
    }
  }

  try {
    let json = undefined;
    if (typeof message === "string") {
      json = JSON.parse(message) as unknown;
    } else if (message instanceof ArrayBuffer && zstd) {
      json = JSON.parse(
        decoder.decode(zstd.ZstdStream.decompress(new Uint8Array(message))),
      ) as unknown;
    }

    if (json !== undefined) {
      const result = WsMessageSchema.safeParse(json);

      if (result.success) {
        const msg = result.data;
        // Columnar replay batch: fan rows out to the slot:update path
        // so downstream sees per-slot items either way
        if (msg.topic === "slot" && msg.key === "batch") {
          for (const value of msg.value)
            enqueue({ topic: "slot", key: "update", value });
          return;
        }
        enqueue(fillEpochLeaderSlots(msg));
        return;
      }

      const failureKey = getZodFailureKey(json);
      if (failureKey == null) {
        logDebug("zod", json);
        logDebug("Zod", result.error.message);
        logDebug("Zod", result.error.issues);
        return;
      } else if (!loggedZodFailures.has(failureKey)) {
        loggedZodFailures.add(failureKey);
        logDebug("zod", json);
        logDebug("Zod", result.error.message);
        logDebug("Zod", result.error.issues);
      }
    }
  } catch (e) {
    logError("WS", e);
  }
}

/**
 * Adopt mode: the blob worker spawned by index.html (earlyWsWorker.ts)
 * owns the early socket and pumps its frames over a MessagePort; the
 * identical decode pipeline runs here, and sends are routed back via
 * "ws-send" on the port. Frames arriving before the decode path is
 * settled (zstd init) queue in pending.
 */
interface Adopt {
  url: string;
  compress: boolean;
  port: MessagePort;
  zstd: ZstdDecoder | undefined;
  ready: boolean;
  pending: EarlyWsFrame[];
}
let adopt: Adopt | null = null;

function adoptOpen(protocol: string) {
  const a = adopt;
  if (!a) return;
  void (async () => {
    let zstd: ZstdDecoder | undefined;
    if (protocol === "compress-zstd") {
      zstd = await zstdPromise;
      if (adopt !== a) return;
      if (!zstd) {
        // mirror the init-failure fallback: drop the adopted socket and
        // open a worker-owned uncompressed connection
        adopt = null;
        a.port.postMessage({ type: "close-early" } satisfies EarlyPortRequest);
        a.port.close();
        connect(a.url, undefined);
        return;
      }
    }
    a.zstd = zstd;
    a.ready = true;
    logDebug("WS", "Adopted API WebSocket connection");
    handler.onConnectionChange({ type: "connected" });
    const pending = a.pending;
    a.pending = [];
    for (const frame of pending) handleFrame(frame, zstd);
  })();
}

const onMainMessage = (e: MessageEvent<ToWorkerMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case "mainPort":
      mainPort = msg.port;
      msg.port.onmessage = onMainMessage;
      break;
    case "connect":
      void (async () => {
        connect(msg.websocketUrl, msg.compress ? await zstdPromise : undefined);
      })();
      break;
    case "adopt": {
      const a: Adopt = {
        url: msg.websocketUrl,
        compress: msg.compress,
        port: msg.port,
        zstd: undefined,
        ready: false,
        pending: [],
      };
      adopt = a;
      // adopted-mode transport: the blob worker pumps adopt-open,
      // frames and adopt-closed over the transferred port
      a.port.onmessage = (e: MessageEvent<EarlyPortMessage>) => {
        if (adopt !== a) return;
        const pm = e.data;
        switch (pm.type) {
          case "adopt-open":
            adoptOpen(pm.protocol);
            break;
          case "frame":
            if (a.ready) handleFrame(pm.data, a.zstd);
            else a.pending.push(pm.data);
            break;
          case "adopt-closed":
            // adoption is first-connection-only: the existing reconnect
            // logic takes over with a worker-owned socket
            adopt = null;
            a.port.close();
            logDebug(
              "WS",
              `Disconnected adopted WebSocket, reconnecting in ${reconnectDelayMs}ms`,
            );
            handler.onConnectionChange({ type: "disconnected" });
            shredsCalc.resetDataAndClearDeleteTimeout();
            resetPeersHold();
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              void (async () => {
                connect(a.url, a.compress ? await zstdPromise : undefined);
              })();
            }, reconnectDelayMs);
            break;
        }
      };
      handler.onConnectionChange({ type: "connecting" });
      break;
    }
    case "shredsPort": {
      shredsPort?.close();
      shredsPort = msg.port;
      // hand over everything that arrived before the chart attached
      if (shredsCalc.data.slotsShreds)
        shredsPort.postMessage({ type: "seed", data: shredsCalc.data });
      const serverTimeNanos = handler.getValidatorState().serverTimeNanos;
      shredsPortTimeSent = serverTimeNanos != null;
      if (serverTimeNanos != null)
        shredsPort.postMessage({
          type: "serverTime",
          serverTimeMs: Math.round(serverTimeNanos / nsPerMs),
        });
      break;
    }
    case "mainShreds":
      mainShredsForced = msg.enabled;
      // catch the fallback chart up with the events main never received
      if (msg.enabled && shredsCalc.data.slotsShreds)
        postMain({ type: "shredsSeed", data: shredsCalc.data });
      break;
    case "requestPeers":
      peersRequested = true;
      if (peersHolding) releasePeers();
      break;
    case "bootSettled":
      mainSettled = true;
      // idle stream: no pending flush will run the timer check
      if (peersHolding && !pendingBatches.size && !scheduled) releasePeers();
      break;
    case "disconnect":
      if (adopt) {
        adopt.port.close();
        adopt = null;
      }
      shredsCalc.resetDataAndClearDeleteTimeout();
      resetPeersHold();
      clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch {
          logError("WS", "Error closing WebSocket");
        }
        ws = null;
      }
      break;
    case "send":
      if (adopt) {
        // the blob worker owns the adopted socket
        adopt.port.postMessage({
          type: "ws-send",
          data: JSON.stringify(msg.value),
        } satisfies EarlyPortRequest);
      } else if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg.value));
      } else {
        logWarning("WS", "Attempting to send on closed WebSocket", msg.value);
      }

      break;
  }
};
ctx.onmessage = onMainMessage;
