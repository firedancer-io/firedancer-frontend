import { describe, expect, it, vi } from "vitest";
import type * as THREE from "three";
import {
  CertKind,
  DASH_PERIOD_PX,
  FADED_ALPHA,
  VOTE_KIND_COUNT,
  VoteKind,
} from "./consts";
import {
  buildSlotVotes,
  type VotesData,
  type VotesDataTile,
} from "./votesData";
import { applyVotesDelta, type LiveTiles } from "./liveTiles";
import type { VotesCacheDelta } from "./votesCache";
import {
  showNearVotesTiles,
  createVotesScene,
  drawVotesCurves,
  drawVotesLatency,
  isLatencyDrawn,
  moveVotesCamera,
  resizeVotesScene,
  showVotesView,
  syncVotesTiles,
  type VotesLayout,
} from "./votesScene";

const widthPx = 1000;
const curvesLayout: VotesLayout = {
  view: "curves",
  granularity: "vote",
  markerStyle: "tick",
  ticks: [],
};

function createScene(getWasContextLost = () => false) {
  const votesScene = createVotesScene(getWasContextLost);
  resizeVotesScene(votesScene, widthPx, 100, 2);
  moveVotesCamera(votesScene, [0, 4_000]);
  return votesScene;
}

type Scene = ReturnType<typeof createScene>;

function getArray(
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry>,
  name: string,
) {
  const { geometry } = mesh;
  const { array, itemSize } = geometry.getAttribute(name);
  return Array.from(array.slice(0, geometry.instanceCount * itemSize));
}

// notar votes of one slot, as one tile holds them
function partial(ts: number[]) {
  const curves = Array.from({ length: VOTE_KIND_COUNT }, () => ({
    ts: [] as number[],
    frac: [] as number[],
  }));
  curves[VoteKind.Notar] = { ts, frac: ts.map((_, i) => (i + 1) / 10) };
  return {
    curves,
    certs: new Map([[CertKind.Notar, ts[0]]]),
    ownVotes: new Map(),
    parentReadyTs: undefined,
  };
}

function tile(startMs: number, slots: [number, number[]][]): VotesDataTile {
  const data: VotesData = new Map(
    slots.map(([slot, ts]) => [slot, partial(ts)]),
  );
  return { startNs: BigInt(startMs) * 1_000_000n, data };
}

function sync(
  votesScene: Scene,
  tiles: VotesDataTile[],
  changed: VotesDataTile[],
) {
  syncVotesTiles(
    votesScene,
    tiles,
    buildSlotVotes(tiles.map(({ data }) => data)),
    changed.map(({ startNs }) => startNs),
  );
  showNearVotesTiles(votesScene);
}

function getMeshes(votesScene: Scene, startNs: bigint) {
  return votesScene.curves.tiles.get(startNs)?.meshes;
}

function getVersions({ curves }: Scene) {
  return new Map(
    [...curves.tiles].flatMap(([startNs, { meshes }]) =>
      meshes
        ? [
            [
              startNs,
              (
                meshes.lines.mesh.geometry.getAttribute(
                  "instanceSegment",
                ) as THREE.BufferAttribute
              ).version,
            ] as const,
          ]
        : [],
    ),
  );
}

function getRebuilt(before: Map<bigint, number>, votesScene: Scene) {
  return [...getVersions(votesScene)]
    .filter(([startNs, version]) => before.get(startNs) !== version)
    .map(([startNs]) => Number(startNs / 1_000_000n));
}

// slot 2 straddles the first two tiles
function createTiles() {
  return [
    tile(0, [
      [1, [100, 200]],
      [2, [3_900]],
    ]),
    tile(4_000, [
      [2, [4_100]],
      [3, [5_000, 5_100]],
    ]),
    tile(8_000, [[4, [9_000]]]),
  ];
}

function draw(
  votesScene: Scene,
  tiles: VotesDataTile[],
  layout = curvesLayout,
) {
  drawVotesCurves(
    votesScene,
    tiles,
    buildSlotVotes(tiles.map(({ data }) => data)),
    layout,
  );
  showNearVotesTiles(votesScene);
}

function createDrawnScene(tiles = createTiles()) {
  const votesScene = createScene();
  moveVotesCamera(votesScene, [0, 12_000]);
  draw(votesScene, tiles);
  return votesScene;
}

function getSegmentStarts(votesScene: Scene) {
  return [...votesScene.curves.tiles].flatMap(([startNs, { meshes }]) =>
    meshes
      ? [
          [
            Number(startNs / 1_000_000n),
            getArray(meshes.lines.mesh, "instanceSegment")
              .filter((_, i) => i % 4 === 0)
              .map((x) => x + meshes.referenceMs),
          ],
        ]
      : [],
  );
}

describe("syncVotesTiles", () => {
  it("draws each slot once, in the first tile holding its votes", () => {
    expect(getSegmentStarts(createDrawnScene())).toEqual([
      [0, [100, 100, 3_900, 3_900]],
      [4_000, [5_000, 5_000]],
      [8_000, [9_000]],
    ]);
  });

  it("rebuilds only the live tile for a live delta to its own slots", () => {
    const tiles = createTiles();
    const votesScene = createDrawnScene(tiles);
    const before = getVersions(votesScene);
    tiles[2] = tile(8_000, [[4, [9_000, 9_100]]]);
    sync(votesScene, tiles, [tiles[2]]);
    expect(getRebuilt(before, votesScene)).toEqual([8_000]);
  });

  it("also rebuilds the tile that owns a slot getting late votes", () => {
    const tiles = createTiles();
    const votesScene = createDrawnScene(tiles);
    const before = getVersions(votesScene);
    tiles[2] = tile(8_000, [
      [4, [9_000]],
      [2, [8_500]],
    ]);
    sync(votesScene, tiles, [tiles[2]]);
    expect(getRebuilt(before, votesScene)).toEqual([0, 8_000]);
    expect(getSegmentStarts(votesScene)[0]).toEqual([
      0,
      [100, 100, 3_900, 3_900, 4_100],
    ]);
  });

  it("rebuilds nothing when panning", () => {
    const votesScene = createDrawnScene();
    const before = getVersions(votesScene);
    moveVotesCamera(votesScene, [6_000, 10_000]);
    expect(getRebuilt(before, votesScene)).toEqual([]);
    expect(getMeshes(votesScene, 0n)?.group.position.x).toBe(-6_000);
  });

  it("builds added tiles and pools evicted ones, handing over their slots", () => {
    const tiles = createTiles();
    const votesScene = createDrawnScene(tiles);
    const evicted = getMeshes(votesScene, tiles[0].startNs)!;
    const before = getVersions(votesScene);

    const added = tile(12_000, [[5, [12_100]]]);
    sync(votesScene, [tiles[1], tiles[2], added], [added]);

    expect(votesScene.curves.tiles.has(tiles[0].startNs)).toBe(false);
    // the added tile reuses the evicted tile's meshes
    expect(getMeshes(votesScene, added.startNs)).toBe(evicted);
    expect(getRebuilt(before, votesScene)).toEqual([4_000, 12_000]);
    expect(getSegmentStarts(votesScene)).toEqual([
      [4_000, [4_100, 5_000, 5_000]],
      [8_000, [9_000]],
      [12_000, [12_100]],
    ]);
  });

  it("forgets late votes of a live tile that owns no slots once it clears", () => {
    const tiles = [
      tile(0, [[1, [100]]]),
      tile(4_000, [[2, [4_100]]]),
      tile(8_000, [[2, [8_100]]]),
    ];
    const votesScene = createDrawnScene(tiles);
    tiles[2].data.set(1, partial([8_200]));
    sync(votesScene, tiles, [tiles[2]]);
    expect(getSegmentStarts(votesScene)[0]).toEqual([0, [100, 100]]);

    sync(votesScene, tiles.slice(0, 2), []);
    expect(getSegmentStarts(votesScene)).toEqual([
      [0, [100]],
      [4_000, [4_100]],
    ]);
  });

  it("refades the owner when a final cert arrives in a later tile", () => {
    const tiles = [tile(0, [[1, [100, 300]]])];
    const votesScene = createDrawnScene(tiles);
    const alphas = () =>
      getArray(getMeshes(votesScene, 0n)!.lines.mesh, "instanceColor").filter(
        (_, i) => i % 4 === 3,
      );
    expect(alphas()).not.toContain(Math.fround(FADED_ALPHA));

    const live = tile(4_000, []);
    live.data.set(1, {
      ...partial([]),
      certs: new Map([[CertKind.Finalize, 200]]),
    });
    sync(votesScene, [...tiles, live], [live]);
    expect(alphas()).toContain(Math.fround(FADED_ALPHA));
  });

  it("rebuilds the previous owner when an earlier tile takes over a slot", () => {
    const tiles = createTiles().slice(1);
    const votesScene = createDrawnScene(tiles);
    const added = tile(0, [[2, [3_900]]]);
    sync(votesScene, [added, ...tiles], [added]);
    expect(getSegmentStarts(votesScene)).toEqual([
      [4_000, [5_000, 5_000]],
      [8_000, [9_000]],
      [0, [3_900, 3_900]],
    ]);
  });

  it("rebuilds in place only the tiles near the view when the layout changes", () => {
    const tiles = createTiles();
    const votesScene = createDrawnScene(tiles);
    const nearMeshes = [0n, 4_000_000_000n].map((ns) =>
      getMeshes(votesScene, ns),
    );
    moveVotesCamera(votesScene, [0, 1_000]);
    const before = getVersions(votesScene);
    draw(votesScene, tiles, { ...curvesLayout, markerStyle: "icon" });
    expect(getRebuilt(before, votesScene)).toEqual([0, 4_000]);
    expect([0n, 4_000_000_000n].map((ns) => getMeshes(votesScene, ns))).toEqual(
      nearMeshes,
    );
    expect(getMeshes(votesScene, 8_000_000_000n)).toBeUndefined();
  });

  it("hides built tiles away from the view and shows them again without rebuilding", () => {
    const tiles = createTiles();
    const votesScene = createDrawnScene(tiles);
    const farMeshes = getMeshes(votesScene, 8_000_000_000n)!;

    moveVotesCamera(votesScene, [-20_000, -19_000]);
    showNearVotesTiles(votesScene);
    expect(farMeshes.group.visible).toBe(false);

    const before = getVersions(votesScene);
    moveVotesCamera(votesScene, [9_500, 10_500]);
    showNearVotesTiles(votesScene);
    expect(farMeshes.group.visible).toBe(true);
    expect(getMeshes(votesScene, 8_000_000_000n)).toBe(farMeshes);
    expect(getRebuilt(before, votesScene)).toEqual([]);
  });

  it("rebuilds a stale tile before rendering it when panning into it", () => {
    const tiles = createTiles();
    const votesScene = createDrawnScene(tiles);
    moveVotesCamera(votesScene, [0, 1_000]);
    resizeVotesScene(votesScene, widthPx, 200, 2);
    draw(votesScene, tiles);
    const before = getVersions(votesScene);

    moveVotesCamera(votesScene, [9_500, 10_500]);
    showNearVotesTiles(votesScene);
    expect(getRebuilt(before, votesScene)).toEqual([8_000]);
    const meshes = getMeshes(votesScene, 8_000_000_000n)!;
    expect(meshes.group.visible).toBe(true);
    expect(getArray(meshes.lines.mesh, "instanceSegment")[1]).toBe(196);
  });

  it("rebuilds a stale owner with its latest slots when shown", () => {
    const tiles = createTiles();
    const votesScene = createDrawnScene(tiles);
    moveVotesCamera(votesScene, [13_000, 14_000]);
    draw(votesScene, tiles, { ...curvesLayout, markerStyle: "icon" });
    tiles[2] = tile(8_000, [
      [4, [9_000]],
      [2, [8_500]],
    ]);
    sync(votesScene, tiles, [tiles[2]]);
    expect(getMeshes(votesScene, 0n)?.group.visible ?? false).toBe(false);

    moveVotesCamera(votesScene, [0, 1_000]);
    showNearVotesTiles(votesScene);
    expect(getSegmentStarts(votesScene)[0]).toEqual([
      0,
      [100, 100, 3_900, 3_900, 4_100],
    ]);
  });

  it("keeps a bounded pool of meshes and reuses all of it", () => {
    const createMany = (firstSlot: number) =>
      Array.from({ length: 20 }, (_, i) =>
        tile(i * 4_000, [[firstSlot + i, [i * 4_000 + 100]]]),
      );
    const votesScene = createScene();
    moveVotesCamera(votesScene, [0, 80_000]);
    draw(votesScene, createMany(0));
    const pooled = [...votesScene.curves.tiles.values()].map((t) => t.meshes!);
    const disposes = pooled.map((m) =>
      vi.spyOn(m.lines.mesh.geometry, "dispose"),
    );

    sync(votesScene, [], []);
    expect(votesScene.curves.availableMeshes).toHaveLength(8);
    expect(disposes.filter((d) => d.mock.calls.length)).toHaveLength(12);

    const replaced = createMany(100);
    sync(votesScene, replaced, replaced);
    const reused = [...votesScene.curves.tiles.values()].filter((t) =>
      pooled.includes(t.meshes!),
    );
    expect(reused).toHaveLength(8);
    expect(votesScene.curves.availableMeshes).toHaveLength(0);
  });

  it("disposes only a mesh's own buffers, not the shared base quad", () => {
    const votesScene = createScene();
    moveVotesCamera(votesScene, [0, 80_000]);
    draw(
      votesScene,
      Array.from({ length: 20 }, (_, i) =>
        tile(i * 4_000, [[i, [i * 4_000 + 100]]]),
      ),
    );
    const meshes = [...votesScene.curves.tiles.values()].map((t) => t.meshes!);
    sync(votesScene, [], []);

    const pooled = votesScene.curves.availableMeshes;
    const disposed = meshes.filter((m) => !pooled.includes(m));
    expect(disposed).toHaveLength(12);
    for (const { lines } of disposed) {
      expect(lines.mesh.geometry.index).toBeNull();
      expect(lines.mesh.geometry.hasAttribute("position")).toBe(false);
    }
    for (const { lines } of pooled) {
      expect(lines.mesh.geometry.index).not.toBeNull();
      expect(lines.mesh.geometry.hasAttribute("position")).toBe(true);
    }
  });

  it("gives back the meshes of stale tiles away from the view", () => {
    const votesScene = createScene();
    moveVotesCamera(votesScene, [0, 80_000]);
    const many = Array.from({ length: 20 }, (_, i) =>
      tile(i * 4_000, [[i, [i * 4_000 + 100]]]),
    );
    draw(votesScene, many);
    moveVotesCamera(votesScene, [0, 4_000]);
    draw(votesScene, many, { ...curvesLayout, markerStyle: "icon" });

    const withMeshes = [...votesScene.curves.tiles.values()].filter(
      (t) => t.meshes,
    );
    expect(withMeshes.length).toBeLessThanOrEqual(3);
  });

  it("fully resets reused meshes", () => {
    const denseTs = Array.from({ length: 300 }, (_, i) => 100 + i * 10);
    const dense = tile(0, [[1, denseTs]]);
    dense.data.get(1)!.ownVotes.set(VoteKind.Notar, 150);
    const votesScene = createDrawnScene([dense]);
    draw(votesScene, [dense], { ...curvesLayout, markerStyle: "icon" });
    const meshes = getMeshes(votesScene, 0n)!;
    sync(votesScene, [], []);

    moveVotesCamera(votesScene, [50_000, 51_000]);
    draw(votesScene, [], curvesLayout);
    const added = tile(48_000, [[2, [50_100]]]);
    sync(votesScene, [added], [added]);
    expect(getMeshes(votesScene, added.startNs)).toBe(meshes);
    expect(meshes.group.visible).toBe(true);
    expect(meshes.group.parent).toBe(votesScene.curves.group);
    expect(meshes.group.position.x).toBe(0);
    expect(meshes.referenceMs).toBe(50_000);
    const segments = getArray(meshes.lines.mesh, "instanceSegment");
    expect(segments).toHaveLength(4);
    expect(segments.slice(0, 3)).toEqual([100, 96, 100]);
    expect(meshes.markers.mesh.geometry.instanceCount).toBe(1);
    expect(meshes.triangles.mesh.geometry.instanceCount).toBe(0);
  });

  it("doesn't dispose pooled meshes after the context is lost", () => {
    const votesScene = createScene(() => true);
    moveVotesCamera(votesScene, [0, 80_000]);
    const many = Array.from({ length: 20 }, (_, i) =>
      tile(i * 4_000, [[i, [i * 4_000 + 100]]]),
    );
    draw(votesScene, many);
    const disposes = [...votesScene.curves.tiles.values()].map((t) =>
      vi.spyOn(t.meshes!.lines.mesh.geometry, "dispose"),
    );
    sync(votesScene, [], []);
    expect(disposes.some((d) => d.mock.calls.length)).toBe(false);
  });

  it("stops syncing hidden curves and rebuilds them when shown again", () => {
    const tiles = createTiles();
    const votesScene = createDrawnScene(tiles);
    showVotesView(votesScene, "slotLatency");
    const before = getVersions(votesScene);
    tiles[2] = tile(8_000, [[4, [9_000, 9_100]]]);
    sync(votesScene, tiles, [tiles[2]]);
    expect(getRebuilt(before, votesScene)).toEqual([]);

    showVotesView(votesScene, "curves");
    expect(votesScene.curves.layout).toBeUndefined();
    draw(votesScene, tiles);
    expect(getSegmentStarts(votesScene).at(-1)).toEqual([
      8_000,
      [9_000, 9_000],
    ]);
  });

  it("starts each tile small and grows it for dense slots", () => {
    const small = getMeshes(createDrawnScene(), 0n)!;
    expect(small.lines.capacity).toBeLessThanOrEqual(64);

    const denseTs = Array.from({ length: 300 }, (_, i) => 100 + i * 10);
    const dense = getMeshes(createDrawnScene([tile(0, [[1, denseTs]])]), 0n)!;
    expect(dense.lines.capacity).toBeGreaterThan(64);
    expect(dense.lines.mesh.geometry.instanceCount).toBeGreaterThanOrEqual(300);
  });

  it("waits for the first layout before building", () => {
    const votesScene = createScene();
    sync(votesScene, createTiles(), createTiles());
    expect(votesScene.curves.tiles.size).toBe(0);
  });
});

// deterministic so failures reproduce
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

type TileMeshes = NonNullable<ReturnType<typeof getMeshes>>;

function getDrawn({ lines, markers, referenceMs }: TileMeshes) {
  const segments = getArray(lines.mesh, "instanceSegment");
  const colors = getArray(lines.mesh, "instanceColor");
  const markerXs = getArray(markers.mesh, "instanceMarker").filter(
    (_, i) => i % 4 === 0,
  );
  return [
    ...Array.from({ length: segments.length / 4 }, (_, i) =>
      [
        segments[i * 4] + referenceMs,
        segments[i * 4 + 1],
        segments[i * 4 + 2] + referenceMs,
        segments[i * 4 + 3],
        colors[i * 4 + 3],
      ].join(),
    ),
    ...markerXs.map((x) => `marker ${x + referenceMs}`),
  ].sort();
}

function getDrawnXs({ lines, markers, referenceMs }: TileMeshes) {
  const segments = getArray(lines.mesh, "instanceSegment");
  const markerXs = getArray(markers.mesh, "instanceMarker");
  return [
    ...segments.filter((_, i) => i % 2 === 0),
    ...markerXs.filter((_, i) => i % 4 === 0),
  ].map((x) => x + referenceMs);
}

describe("syncVotesTiles against a full redraw", () => {
  it("matches near the view after random deltas, layout changes and pans", () => {
    const random = createRandom(3);
    const randomSlots = (startMs: number): [number, number[]][] =>
      Array.from({ length: Math.floor(random() * 3) }, () => {
        const slot = Math.floor(random() * 12);
        return [slot, [startMs + Math.floor(random() * 4_000)]];
      });
    const overscanMs = 4_000;

    for (let run = 0; run < 100; run++) {
      const votesScene = createDrawnScene([]);
      let heightPx = 100;
      let viewMs: [number, number] = [0, 12_000];
      const settled = new Map<bigint, VotesDataTile>();
      const liveTiles: LiveTiles = { vote: null, vote_batch: null };

      for (let step = 0; step < 25; step++) {
        const startMs = Math.floor(random() * 6) * 4_000;
        const op = random();
        let delta: VotesCacheDelta | undefined;
        if (op < 0.25) {
          const live = liveTiles.vote;
          // settling the live tile keeps its data object
          const added =
            live && Number(live.startNs / 1_000_000n) === startMs
              ? live
              : tile(startMs, randomSlots(startMs));
          settled.set(added.startNs, added);
          delta = { kind: "add", tiles: [{ ...added, endNs: 0n, meta: null }] };
        } else if (op < 0.5) {
          // the live tile is never also settled
          const freeStartMs = [
            0, 4_000, 8_000, 12_000, 16_000, 20_000, 24_000,
          ].find((ms) => !settled.has(BigInt(ms) * 1_000_000n))!;
          const live = liveTiles.vote ?? tile(freeStartMs, []);
          for (const [slot, ts] of randomSlots(
            Number(live.startNs / 1_000_000n),
          )) {
            live.data.set(slot, partial(ts));
          }
          delta = {
            kind: "live",
            tile: { ...live, endNs: 0n, meta: null },
            newData: live.data,
            isNewTile: !liveTiles.vote,
          };
        } else if (op < 0.6) {
          settled.delete([...settled.keys()][0]);
          delta = { kind: "add", tiles: [] };
        } else if (op < 0.7) {
          delta = { kind: "clearLive" };
        } else if (op < 0.8) {
          heightPx = 100 + Math.floor(random() * 3) * 50;
          resizeVotesScene(votesScene, widthPx, heightPx, 2);
        } else {
          const viewStartMs = Math.floor(random() * 32_000) - 4_000;
          viewMs = [viewStartMs, viewStartMs + 1_000 + random() * 8_000];
          moveVotesCamera(votesScene, viewMs);
        }

        const changed = delta ? applyVotesDelta(liveTiles, "vote", delta) : [];
        const tiles = [...settled.values()];
        if (liveTiles.vote) tiles.push(liveTiles.vote);
        const slotVotes = buildSlotVotes(tiles.map(({ data }) => data));
        // like the render path
        if (!votesScene.curves.layout) {
          drawVotesCurves(votesScene, tiles, slotVotes, curvesLayout);
        } else {
          syncVotesTiles(votesScene, tiles, slotVotes, changed);
        }
        showNearVotesTiles(votesScene);

        const reference = createScene();
        resizeVotesScene(reference, widthPx, heightPx, 2);
        moveVotesCamera(reference, [-100_000, 100_000]);
        draw(reference, tiles);
        for (const [startNs, { meshes }] of reference.curves.tiles) {
          const drawnMeshes = getMeshes(votesScene, startNs);
          const isVisible = !!drawnMeshes?.group.visible;
          const isNear = meshes
            ? getDrawnXs(meshes).some(
                (x) =>
                  x >= viewMs[0] - overscanMs && x <= viewMs[1] + overscanMs,
              )
            : false;
          if (isNear) expect(isVisible).toBe(true);
          if (drawnMeshes?.group.visible) {
            expect(drawnMeshes.group.parent).toBe(votesScene.curves.group);
            expect(getDrawn(drawnMeshes)).toEqual(
              meshes ? getDrawn(meshes) : [],
            );
          }
        }
        for (const [startNs, { meshes }] of votesScene.curves.tiles) {
          if (meshes?.group.visible) {
            expect(reference.curves.tiles.has(startNs)).toBe(true);
          }
        }
      }
    }
  });
});

describe("moveVotesCamera", () => {
  // where in the dash pattern a timeline position lands on screen
  function dashPhaseAt(timeMs: number, startMs: number, spanMs: number) {
    const votesScene = createScene();
    moveVotesCamera(votesScene, [startMs, startMs + spanMs]);
    const offsetPx = votesScene.resources.segmentMaterial.uniforms.uDashOffsetPx
      .value as number;
    const x = ((timeMs - startMs) * widthPx) / spanMs;
    return (
      (((x + offsetPx) % DASH_PERIOD_PX) + DASH_PERIOD_PX) % DASH_PERIOD_PX
    );
  }

  it("keeps dashes at the same timeline position while the view scrolls", () => {
    const phase = dashPhaseAt(12_345, 10_000, 6_000);
    for (const startMs of [10_016.7, 10_033.3, 11_000, 12_000, -500]) {
      expect(dashPhaseAt(12_345, startMs, 6_000)).toBeCloseTo(phase);
    }
  });
});

describe("drawVotesLatency", () => {
  const latencyLayout: VotesLayout = {
    ...curvesLayout,
    view: "slotLatency",
    ticks: [50, 100],
  };
  const series = {};
  const votesScene = createScene();
  moveVotesCamera(votesScene, [10_000, 11_000]);
  drawVotesLatency(
    votesScene,
    {
      guideYs: [40.2],
      strokes: [
        {
          color: "#FFFFFF",
          alpha: 0.5,
          widthPx: 1,
          dashPx: 0,
          segments: [10_100, 5, 10_200, 6],
        },
        {
          color: "#000000",
          alpha: 1,
          widthPx: 2,
          dashPx: 5,
          segments: [10_300, 7, 10_400, 8, 10_400, 8, 10_500, 9],
        },
      ],
      markers: [
        {
          x: 10_250,
          y: 20,
          widthPx: 3,
          heightPx: 4,
          alpha: 1,
          color: "#FF0000",
        },
        {
          x: 10_260,
          y: 30,
          widthPx: 5,
          heightPx: 6,
          alpha: 0.5,
          icon: "finalized",
        },
      ],
      triangles: [],
    },
    latencyLayout,
    series,
  );
  const { meshes, guides } = votesScene.latency;

  it("is drawn until the layout or data changes", () => {
    expect(isLatencyDrawn(votesScene, latencyLayout, series)).toBe(true);
    expect(isLatencyDrawn(votesScene, latencyLayout, {})).toBe(false);
    expect(
      isLatencyDrawn(votesScene, { ...latencyLayout, ticks: [50] }, series),
    ).toBe(false);
  });

  it("stores positions relative to the camera when drawn", () => {
    expect(getArray(meshes.lines.mesh, "instanceSegment")).toEqual([
      100, 5, 200, 6, 300, 7, 400, 8, 400, 8, 500, 9,
    ]);
    expect(
      getArray(meshes.markers.mesh, "instanceMarker").filter(
        (_, i) => i % 4 === 0,
      ),
    ).toEqual([250, 260]);
  });

  it("gives each stroke its own layer above the guides", () => {
    const layers = (mesh: THREE.Mesh<THREE.InstancedBufferGeometry>) =>
      getArray(mesh, "instanceStyle").filter((_, i) => i % 4 === 2);
    expect(layers(guides.mesh)).toEqual([0]);
    expect(layers(meshes.lines.mesh)).toEqual([1, 2, 2]);
  });

  it("draws crisp guides across the view", () => {
    expect(getArray(guides.mesh, "instanceSegment")).toEqual([
      0, 40.5, 1, 40.5,
    ]);
  });

  it("marks icons by index and other markers as plain color", () => {
    expect(getArray(meshes.markers.mesh, "instanceIcon")).toEqual([-1, 1]);
  });

  it("forgets what was drawn on resize", () => {
    const resized = createScene();
    drawVotesLatency(
      resized,
      { guideYs: [], strokes: [], markers: [], triangles: [] },
      latencyLayout,
      series,
    );
    resizeVotesScene(resized, widthPx, 200, 2);
    expect(isLatencyDrawn(resized, latencyLayout, series)).toBe(false);
  });

  it("grows past the initial capacity", () => {
    const count = 5_000;
    const segments = Array.from({ length: count }, (_, i) => [
      10_000 + i,
      0,
      10_001 + i,
      1,
    ]).flat();
    drawVotesLatency(
      votesScene,
      {
        guideYs: [],
        strokes: [
          { color: "#FFFFFF", alpha: 1, widthPx: 1, dashPx: 0, segments },
        ],
        markers: [],
        triangles: [],
      },
      latencyLayout,
      series,
    );
    const drawn = getArray(meshes.lines.mesh, "instanceSegment");
    expect(drawn).toHaveLength(count * 4);
    expect(drawn.slice(-4)).toEqual([count - 1, 0, count, 1]);
  });
});
