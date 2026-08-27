import { expect, describe, it, afterEach, beforeEach, vi } from "vitest";
import * as THREE from "three";
import { ShredEvent } from "../../../../../api/entityEnums";
import {
  createShredsCalc,
  shredsDataToJson,
} from "../../../../../api/worker/cache/shreds/shredsCalc";
import type { LiveShreds } from "../../../../../api/types";
import { createWebglResources } from "../../../../WebGl/webglUtils";
import { drawScene, type SceneObjects, type TsRange } from "../drawCore";

function makeObjs(): SceneObjects {
  return {
    renderer: { render: vi.fn() } as unknown as THREE.WebGLRenderer,
    camera: new THREE.OrthographicCamera(0, 0, 0, 0, 0.5, 10),
    scene: new THREE.Scene(),
    meshes: new Map(),
    availableMeshes: [],
    resources: createWebglResources(),
  };
}

/** deterministic events: all types, duplicates, row holes, idx jumps */
function makeLiveShreds(): LiveShreds {
  let state = 12345;
  const rand = (n: number) => {
    state = (state * 1103515245 + 12345) & 0x3fffffff;
    return state % n;
  };

  const slot_delta: number[] = [];
  const shred_idx: (number | null)[] = [];
  const event: number[] = [];
  const event_ts_delta: number[] = [];
  const rowEvents = [
    ShredEvent.shred_repair_request,
    ShredEvent.shred_received_turbine,
    ShredEvent.shred_received_repair,
    ShredEvent.shred_replayed,
    ShredEvent.shred_published,
  ];

  for (let slot = 0; slot < 6; slot++) {
    for (let i = 0; i < 200; i++) {
      slot_delta.push(slot);
      shred_idx.push(rand(40) * (1 + rand(3))); // holes + idx jumps
      const ev = rowEvents[rand(rowEvents.length)];
      event.push(ev);
      // ts loosely tracks priority so multi-rect chains survive, with
      // jitter so some events overlap-drop
      event_ts_delta.push(
        (500 + slot * 900 + ev * 120 + rand(300)) * 1_000_000,
      );
    }
    if (slot < 5) {
      // last slot stays incomplete (rects extend to max x)
      slot_delta.push(slot);
      shred_idx.push(null);
      event.push(ShredEvent.slot_complete);
      event_ts_delta.push((900 + slot * 900 + rand(2000)) * 1_000_000);
    }
  }

  return {
    reference_slot: 1000,
    reference_ts: 0n,
    slot_delta,
    shred_idx,
    event,
    event_ts_delta,
  } as LiveShreds;
}

describe("drawScene rect stream", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is byte-identical between the flat worker rows and the JSON atom rows", () => {
    const calc = createShredsCalc(() => ({
      isStartup: undefined,
      serverTimeNanos: undefined,
    }));
    calc.add(makeLiveShreds());
    const flat = calc.data;
    const json = shredsDataToJson(flat);
    expect(flat.range).toBeDefined();
    expect(flat.minCompletedSlot).toBeDefined();

    const streams = [flat, json].map((data) => {
      const objs = makeObjs();
      const visibleTsRangeRef: { current: TsRange | undefined } = {
        current: undefined,
      };
      drawScene(objs, [], visibleTsRangeRef, {
        liveShreds: data.slotsShreds!,
        slotRange: data.range!,
        minCompletedSlot: data.minCompletedSlot!,
        skippedSlotsCluster: new Set([1002]),
        serverTimeMs: 10_000,
        scale: 1,
        minDirtySlot: undefined,
        cssRange: [0, 1397],
        forceDraw: false,
      });
      return new Map(
        [...objs.meshes].map(([slotNumber, mesh]) => [
          slotNumber,
          {
            count: mesh.count,
            rects: mesh.rectArray.slice(0, mesh.count * 4),
            colors: mesh.colorArray.slice(0, mesh.count * 3),
          },
        ]),
      );
    });

    const [flatStream, jsonStream] = streams;
    expect([...flatStream.keys()]).toEqual([...jsonStream.keys()]);
    let rects = 0;
    for (const [slotNumber, flatMesh] of flatStream) {
      const jsonMesh = jsonStream.get(slotNumber)!;
      expect(flatMesh.count).toBe(jsonMesh.count);
      expect(flatMesh.rects).toEqual(jsonMesh.rects);
      expect(flatMesh.colors).toEqual(jsonMesh.colors);
      rects += flatMesh.count;
    }
    // the dataset actually exercised the fill
    expect(flatStream.size).toBe(6);
    expect(rects).toBeGreaterThan(200);
  });
});
