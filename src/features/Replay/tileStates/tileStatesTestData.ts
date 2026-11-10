import { TileState, tileStatesResponseSchema } from "../../../api/entities";
import type {
  Tile,
  TileStatesGranularity,
  TimelineTileStates,
} from "../../../api/types";
import * as THREE from "three";
import { createRectResources } from "../../WebGl/webglUtils";
import { createSlotHighlight } from "../slotHighlight";
import { trackStates, type TileKind } from "./consts";
import { createStatesMesh, createTileStatesMaterial } from "./tileStatesMesh";
import { tileStatesBarLayout } from "./tileStatesRects";
import type { RendererObj } from "./utils";

export const testTiles: Tile[] = [
  { kind: "execrp", kind_id: 0 },
  { kind: "replay", kind_id: 0 },
  { kind: "execrp", kind_id: 1 },
  { kind: "execrp", kind_id: 2 },
];

export interface TestState {
  tileIdx: number;
  state: TileState;
  // ns from the response's first chunk
  startNs: number;
  endNs: number;
  // NaN without a slot
  slot: number;
}

export const TEST_REFERENCE_SLOT = 400_000_000;

export function createRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 2 ** 32;
    return value / 2 ** 32;
  };
}

interface ResponseOpts {
  granularity: TileStatesGranularity;
  startNs: bigint;
  chunkCount: number;
  chunkNs: number;
  // typical state duration
  stateNs: number;
  idleChance: number;
}

interface TileTimelineState {
  state: TileState;
  startNs: number;
  endNs: number;
  // the slot or txn segment it's in, -1 if none
  segment: number;
  // the LtHash task it is, without a segment
  isLthash: boolean;
  slot: number;
}

/** Back to back states of a tile, in segments of a few slots */
function createTileTimeline(
  random: () => number,
  drawn: TileState[],
  endNs: number,
  { stateNs, idleChance }: ResponseOpts,
) {
  const timeline: TileTimelineState[] = [];
  let segment = -1;
  let segmentSlot = NaN;
  for (let timeNs = 0; timeNs < endNs; ) {
    const durNs = Math.min(
      Math.max(1, Math.round(stateNs * 10 ** (random() * 3 - 1.5))),
      endNs - timeNs,
    );
    if (segment >= 0 && random() < 0.1) segment = -1;
    if (segment < 0 && random() < 0.5) {
      segment = timeline.length;
      segmentSlot = TEST_REFERENCE_SLOT + Math.floor(random() * 12);
    }
    const isLthash = segment < 0 && random() < 0.05;
    timeline.push({
      state:
        random() < idleChance
          ? TileState.Idle
          : drawn[Math.floor(random() * drawn.length)],
      startNs: timeNs,
      endNs: timeNs + durNs,
      segment,
      isLthash,
      slot:
        segment >= 0
          ? segmentSlot
          : isLthash
            ? TEST_REFERENCE_SLOT + Math.floor(random() * 12)
            : NaN,
    });
    timeNs += durNs;
  }
  return timeline;
}

/**
 * A server response of random states and slot, txn, and LtHash segments, and
 * the states it holds. A chunk holds each tile's states that end in it, so a
 * tile's first state can start before the chunk.
 */
export function createResponse(
  random: () => number,
  opts: ResponseOpts,
): { res: TimelineTileStates; states: TestState[] } {
  const { granularity, startNs, chunkCount, chunkNs } = opts;
  const timelines = testTiles.map(({ kind }) =>
    createTileTimeline(
      random,
      trackStates[kind as "execrp" | "replay"][granularity],
      chunkCount * chunkNs,
      opts,
    ),
  );
  const states: TestState[] = [];
  timelines.forEach((timeline, tileIdx) => {
    for (const { state, startNs, endNs, slot } of timeline) {
      if (state !== TileState.Idle) {
        states.push({ tileIdx, state, startNs, endNs, slot });
      }
    }
  });

  const chunks = [];
  for (let c = 0; c < chunkCount; c++) {
    const chunkStartNs = c * chunkNs;
    const referenceSlot = TEST_REFERENCE_SLOT + c * 3;
    const tileStartDeltas: string[] = [];
    const stateCnt: number[] = [];
    const chunkStates: number[] = [];
    const durs: number[] = [];
    const slotSegments = {
      lo: [] as number[],
      cnt: [] as number[],
      delta: [] as number[],
    };
    const txnSegments = {
      lo: [] as number[],
      cnt: [] as number[],
      delta: [] as number[],
    };
    const lthash = { lo: [] as number[], delta: [] as number[] };
    timelines.forEach((timeline, tileIdx) => {
      const inChunk = timeline.filter(
        ({ endNs }) => endNs > chunkStartNs && endNs <= chunkStartNs + chunkNs,
      );
      tileStartDeltas.push(
        String(inChunk.length ? inChunk[0].startNs - chunkStartNs : 0),
      );
      stateCnt.push(inChunk.length);
      const segments =
        testTiles[tileIdx].kind === "replay" ? slotSegments : txnSegments;
      inChunk.forEach(
        ({ state, startNs, endNs, segment, isLthash, slot }, i) => {
          const stateIdx = chunkStates.length;
          chunkStates.push(state);
          durs.push(endNs - startNs);
          if (isLthash) {
            lthash.lo.push(stateIdx);
            lthash.delta.push(slot - referenceSlot);
          }
          if (segment < 0) return;
          if (i > 0 && inChunk[i - 1].segment === segment) {
            segments.cnt[segments.cnt.length - 1]++;
          } else {
            segments.lo.push(stateIdx);
            segments.cnt.push(1);
            segments.delta.push(slot - referenceSlot);
          }
        },
      );
    });
    const chunkTs = (startNs + BigInt(chunkStartNs)).toString();
    chunks.push({
      chunk_ts: chunkTs,
      chunk_dur: chunkNs.toString(),
      start_ts: chunkTs,
      tile_start_ts_delta: tileStartDeltas,
      reference_slot: referenceSlot,
      tile: testTiles.map((_, tileIdx) => tileIdx),
      state_cnt: stateCnt,
      state: chunkStates,
      dur: durs,
      slot_state_lo: slotSegments.lo,
      slot_state_cnt: slotSegments.cnt,
      slot_delta: slotSegments.delta,
      txn_state_lo: txnSegments.lo,
      txn_state_cnt: txnSegments.cnt,
      txn_slot_delta: txnSegments.delta,
      txn_idx: txnSegments.lo.map((_, i) => i),
      txn_error_code: txnSegments.lo.map(() => null),
      lthash_state_lo: lthash.lo,
      lthash_slot_delta: lthash.delta,
    });
  }
  const res = tileStatesResponseSchema.parse({
    available_start_ns: null,
    available_end_ns: null,
    granularity,
    chunks,
  });
  return { res, states };
}

/** A renderer's mesh state, without a WebGL context */
export function createTestRendererObj(
  kind: TileKind,
  granularity: TileStatesGranularity,
) {
  const rectResources = createRectResources();
  const tileStatesMaterial = createTileStatesMaterial(
    trackStates[kind][granularity].length,
  );
  return {
    renderer: { domElement: { width: 2800 } },
    rectResources,
    tileStatesMaterial,
    aggMesh: createStatesMesh(
      rectResources.unitQuad,
      tileStatesMaterial,
      tileStatesBarLayout,
    ),
    highlight: createSlotHighlight(),
    composite: {},
    config: {
      kind,
      getStates: (states?: TileStatesGranularity) =>
        trackStates[kind][states ?? "txn"],
    },
    tileStatesScene: new THREE.Scene(),
    dataTileMeshes: new Map(),
    availableMeshes: [],
    aggMeshBuild: undefined,
    aggMaxStateShare: 1,
    liveDataTileKey: undefined,
    renderedGranularity: granularity,
    msPerPx: 0,
    anchorPx: 0,
    viewStartPx: 0,
  } as unknown as RendererObj;
}

/** Each level's drawn rects of the data tile from tileStartNs */
export function getDrawnRects(rendererObj: RendererObj, tileStartNs = 0n) {
  const meshes = [...rendererObj.dataTileMeshes.values()].find(
    ({ startMs }) => startMs === Number(tileStartNs) / 1e6,
  );
  if (!meshes) return [];
  return meshes.levels
    .filter(({ binMs }) => binMs !== Infinity)
    .map(({ binMs, mesh }) => ({
      binMs,
      slot: mesh.slot.slice(0, mesh.count),
      edges: mesh.edges.slice(0, mesh.count * 4),
      bar: mesh.bar.slice(0, mesh.count * mesh.barScales.length),
    }));
}

/** The request starting at startNs, failing clearly if there's none */
export function getRequest<T extends { startNs: bigint }>(
  requests: T[],
  startNs: bigint,
): T {
  const request = requests.find((request) => request.startNs === startNs);
  if (!request) throw new Error(`No request starting at ${startNs}ns`);
  return request;
}
