import * as THREE from "three";
import { isEqual } from "lodash";
import { votesThresholdLineColor } from "../../../colors";
import { MAX_WEBGL_PX_RATIO, nsPerMs } from "../../../consts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers";
import {
  convertToWebGlColor,
  createRenderer,
  createUnitQuad,
  glslFloat,
  type TsRange,
} from "../../WebGl/webglUtils";
import {
  DASH_PERIOD_PX,
  GUIDE_DASH_PX,
  THRESHOLD_LINE_ALPHA,
  VOTES_TILE_NS,
  type MarkerStyle,
  type VotesView,
} from "./consts";
import { OVERSCAN_DRAW_TILES_COUNT } from "../HeaderTrack/useNonAggHeaderQuery";
import type { VotesGranularity } from "../../../api/types";
import {
  buildVotes,
  certIconOrder,
  getIconSizePx,
  getThresholdYs,
  loadCertIcons,
  type Marker,
  type Stroke,
  type VotesGeometry,
} from "./curvesGeometry";
import type { SlotVotes, VotesData, VotesDataTile } from "./votesData";
import {
  NO_SLOT,
  createSlotHighlight,
  getRelativeSlot,
  slotHighlightGlsl,
  type SlotHighlight,
} from "../slotHighlight";

type CertIconImages = Awaited<ReturnType<typeof loadCertIcons>>;

export interface VotesLayout {
  view: VotesView;
  granularity: VotesGranularity;
  markerStyle: MarkerStyle;
  ticks: number[];
}

const LAYER_DEPTH_STEP = 1 / 256;
// about the most tiles near the view at once
const MAX_AVAILABLE_MESHES = 8;

const segmentVertexShader = /* glsl */ `
precision highp float;

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform vec2 uResolution;

in vec2 position;
in vec4 instanceSegment;
in vec4 instanceColor;
in vec4 instanceStyle; // half width px, dash px, layer, dash along y
in float instanceSlot;

out vec4 vColor;
out float vDashPx;
out float vDashAlongY;

const float LAYER_DEPTH_STEP = ${glslFloat(LAYER_DEPTH_STEP)};

${slotHighlightGlsl}

void main() {
  mat4 mvp = projectionMatrix * modelViewMatrix;
  vec2 halfResolution = 0.5 * uResolution;
  vec2 px0 = (mvp * vec4(instanceSegment.xy, 0.0, 1.0)).xy * halfResolution;
  vec2 px1 = (mvp * vec4(instanceSegment.zw, 0.0, 1.0)).xy * halfResolution;

  vec2 delta = px1 - px0;
  float len = length(delta);
  vec2 dir = len > 0.0 ? delta / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  float halfWidth = instanceStyle.x;
  float t = position.x + 0.5;

  // square caps to fill gaps at joints
  vec2 px = mix(px0, px1, t)
    + normal * position.y * 2.0 * halfWidth
    + dir * (t * 2.0 - 1.0) * halfWidth;

  // one depth per stroke so its overlapping segments blend once, like a 2D path
  float depth = 1.0 - (instanceStyle.z + 1.0) * LAYER_DEPTH_STEP;
  gl_Position = vec4(px / halfResolution, depth, 1.0);
  vColor = vec4(highlightSlot(instanceColor.rgb, instanceSlot), instanceColor.a);
  vDashPx = instanceStyle.y;
  vDashAlongY = instanceStyle.w;
}
`;

const segmentFragmentShader = /* glsl */ `
precision highp float;

uniform float uPixelRatio;
uniform float uDashOffsetPx;

in vec4 vColor;
in float vDashPx;
in float vDashAlongY;

out vec4 fragColor;

const float DASH_PERIOD_PX = ${glslFloat(DASH_PERIOD_PX)};

void main() {
  // x + y grows steadily along rising curves, so dashes continue across segments
  float dashPx =
    (gl_FragCoord.x + vDashAlongY * gl_FragCoord.y) / uPixelRatio + uDashOffsetPx;
  if (vDashPx > 0.0 && mod(dashPx, DASH_PERIOD_PX) >= vDashPx) discard;
  fragColor = vColor;
}
`;

const markerVertexShader = /* glsl */ `
precision highp float;

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform vec2 uResolution;

in vec2 position; // y down
in vec4 instanceMarker; // center x, y, width px, height px
in vec4 instanceColor;
in float instanceIcon;
in float instanceSlot;

out vec4 vColor;
out vec2 vUv;
flat out int vIcon;
flat out float vSlot;

void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(instanceMarker.xy, 0.0, 1.0);
  vec2 offsetPx = position * instanceMarker.zw;
  clip.xy += vec2(offsetPx.x, -offsetPx.y) / (0.5 * uResolution);
  gl_Position = clip;
  vColor = instanceColor;
  vUv = vec2(position.x + 0.5, 0.5 - position.y);
  vIcon = int(instanceIcon);
  vSlot = instanceSlot;
}
`;

const markerFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uIcons[${certIconOrder.length}];

in vec4 vColor;
in vec2 vUv;
flat in int vIcon;
flat in float vSlot;

out vec4 fragColor;

${slotHighlightGlsl}

void main() {
  vec4 icon =
    texture(uIcons[0], vUv) * float(vIcon == 0) +
    texture(uIcons[1], vUv) * float(vIcon == 1) +
    texture(uIcons[2], vUv) * float(vIcon == 2);
  float isIcon = float(vIcon >= 0);
  // icons are premultiplied
  vec3 rgb = mix(vColor.rgb, icon.rgb / max(icon.a, 1e-4), isIcon);
  float alpha = mix(1.0, icon.a, isIcon);
  fragColor = vec4(highlightSlot(rgb, vSlot) * alpha, alpha) * vColor.a;
}
`;

function createSegmentMaterial(uniforms: Record<string, THREE.IUniform>) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: segmentVertexShader,
    fragmentShader: segmentFragmentShader,
    side: THREE.DoubleSide,
    transparent: true,
    depthTest: true,
    depthWrite: true,
    depthFunc: THREE.LessDepth,
    uniforms,
  });
}

function createMarkerMaterial(highlight: SlotHighlight) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: markerVertexShader,
    fragmentShader: markerFragmentShader,
    side: THREE.DoubleSide,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uIcons: { value: certIconOrder.map(() => null) },
      ...highlight.uniforms,
    },
  });
}

function createTriangle() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([-0.5, -0.5, 0.5, -0.5, 0, 0.5]),
      2,
    ),
  );
  geometry.setIndex([0, 1, 2]);
  return geometry;
}

const INITIAL_CAPACITY = 2 ** 6;
const segmentItemSizes = {
  instanceSegment: 4,
  instanceColor: 4,
  instanceStyle: 4,
  instanceSlot: 1,
};
const markerItemSizes = {
  instanceMarker: 4,
  instanceColor: 4,
  instanceIcon: 1,
  instanceSlot: 1,
};

interface InstancedMesh<Name extends string> {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.RawShaderMaterial>;
  itemSizes: Record<Name, number>;
  capacity: number;
}

function allocateInstances<Name extends string>(
  instanced: InstancedMesh<Name>,
  capacity: number,
) {
  const { geometry } = instanced.mesh;
  for (const [name, itemSize] of Object.entries<number>(instanced.itemSizes)) {
    const attr = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * itemSize),
      itemSize,
    );
    attr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attr);
  }
  instanced.capacity = capacity;
  // @ts-expect-error private field
  geometry._maxInstanceCount = undefined;
}

function createInstancedMesh<Name extends string>(
  base: THREE.BufferGeometry,
  material: THREE.RawShaderMaterial,
  itemSizes: Record<Name, number>,
  renderOrder: number,
): InstancedMesh<Name> {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute("position", base.getAttribute("position"));
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;

  const instanced = { mesh, itemSizes, capacity: 0 };
  allocateInstances(instanced, INITIAL_CAPACITY);
  return instanced;
}

function getInstanceArrays<Name extends string>(
  instanced: InstancedMesh<Name>,
  count: number,
) {
  if (count > instanced.capacity) {
    let capacity = instanced.capacity;
    while (capacity < count) capacity *= 2;
    allocateInstances(instanced, capacity);
  }
  const { geometry } = instanced.mesh;
  return Object.fromEntries(
    Object.keys(instanced.itemSizes).map((name) => [
      name,
      geometry.getAttribute(name).array,
    ]),
  ) as Record<Name, Float32Array>;
}

function setInstanceCount<Name extends string>(
  instanced: InstancedMesh<Name>,
  count: number,
) {
  const { geometry } = instanced.mesh;
  geometry.instanceCount = count;
  for (const name of Object.keys(instanced.itemSizes)) {
    const attr = geometry.getAttribute(name) as THREE.InstancedBufferAttribute;
    attr.clearUpdateRanges();
    if (count > 0) attr.addUpdateRange(0, count * attr.itemSize);
    attr.needsUpdate = true;
  }
}

function toRelativeSlot(highlight: SlotHighlight, slot: number | undefined) {
  return slot === undefined ? NO_SLOT : getRelativeSlot(highlight, slot);
}

function setStrokes(
  instanced: InstancedMesh<keyof typeof segmentItemSizes>,
  strokes: Stroke[],
  referenceMs: number,
  firstLayer: number,
  dashAlongY: boolean,
  highlight: SlotHighlight,
) {
  const count = strokes.reduce(
    (sum, { segments }) => sum + segments.length / 4,
    0,
  );
  const { instanceSegment, instanceColor, instanceStyle, instanceSlot } =
    getInstanceArrays(instanced, count);
  let i = 0;
  strokes.forEach(
    ({ color, alpha, widthPx, dashPx, segments, slots }, strokeIdx) => {
      const rgba = [...convertToWebGlColor(color), alpha];
      const layer = firstLayer + strokeIdx;
      const style = [widthPx / 2, dashPx, layer, dashAlongY ? 1 : 0];
      for (let s = 0; s < segments.length; s += 4, i++) {
        instanceSlot[i] = toRelativeSlot(highlight, slots[s / 4]);
        instanceSegment[i * 4] = segments[s] - referenceMs;
        instanceSegment[i * 4 + 1] = segments[s + 1];
        instanceSegment[i * 4 + 2] = segments[s + 2] - referenceMs;
        instanceSegment[i * 4 + 3] = segments[s + 3];
        for (let c = 0; c < 4; c++) {
          instanceColor[i * 4 + c] = rgba[c];
          instanceStyle[i * 4 + c] = style[c];
        }
      }
    },
  );
  setInstanceCount(instanced, count);
}

function setMarkers(
  instanced: InstancedMesh<keyof typeof markerItemSizes>,
  markers: Marker[],
  referenceMs: number,
  highlight: SlotHighlight,
) {
  const { instanceMarker, instanceColor, instanceIcon, instanceSlot } =
    getInstanceArrays(instanced, markers.length);
  markers.forEach((marker, i) => {
    instanceSlot[i] = toRelativeSlot(highlight, marker.slot);
    instanceMarker[i * 4] = marker.x - referenceMs;
    instanceMarker[i * 4 + 1] = marker.y;
    instanceMarker[i * 4 + 2] = marker.widthPx;
    instanceMarker[i * 4 + 3] = marker.heightPx;
    const rgb =
      "color" in marker ? convertToWebGlColor(marker.color) : [1, 1, 1];
    instanceColor.set([...rgb, marker.alpha], i * 4);
    instanceIcon[i] =
      "icon" in marker ? certIconOrder.indexOf(marker.icon) : -1;
  });
  setInstanceCount(instanced, markers.length);
}

interface Resources {
  segmentMaterial: THREE.RawShaderMaterial;
  guideMaterial: THREE.RawShaderMaterial;
  markerMaterial: THREE.RawShaderMaterial;
  unitQuad: THREE.BufferGeometry;
  triangle: THREE.BufferGeometry;
}

interface GeometryMeshes {
  group: THREE.Group;
  lines: InstancedMesh<keyof typeof segmentItemSizes>;
  triangles: InstancedMesh<keyof typeof markerItemSizes>;
  markers: InstancedMesh<keyof typeof markerItemSizes>;
  // x is stored relative to the camera reference when built
  referenceMs: number;
}

interface VotesTile {
  data: VotesData;
  slots: number[];
  // undefined when it draws nothing
  rangeMs: TsRange | undefined;
  meshes: GeometryMeshes | undefined;
  stale: boolean;
}

function createGeometryMeshes(resources: Resources): GeometryMeshes {
  const { segmentMaterial, markerMaterial, unitQuad, triangle } = resources;
  const lines = createInstancedMesh(
    unitQuad,
    segmentMaterial,
    segmentItemSizes,
    1,
  );
  const triangles = createInstancedMesh(
    triangle,
    markerMaterial,
    markerItemSizes,
    2,
  );
  const markers = createInstancedMesh(
    unitQuad,
    markerMaterial,
    markerItemSizes,
    3,
  );
  const group = new THREE.Group();
  group.add(lines.mesh, triangles.mesh, markers.mesh);
  return { group, lines, triangles, markers, referenceMs: 0 };
}

function disposeGeometryMeshes({ lines, triangles, markers }: GeometryMeshes) {
  for (const { mesh } of [lines, triangles, markers]) {
    // the base quad and triangle are shared, so free only this mesh's buffers
    mesh.geometry.index = null;
    mesh.geometry.deleteAttribute("position");
    mesh.geometry.dispose();
  }
}

function setGeometry(
  meshes: GeometryMeshes,
  { strokes, markers, triangles }: VotesGeometry,
  cameraReferenceMs: number,
  highlight: SlotHighlight,
) {
  meshes.referenceMs = cameraReferenceMs;
  meshes.group.position.x = 0;
  // guides take layer 0
  setStrokes(meshes.lines, strokes, cameraReferenceMs, 1, true, highlight);
  setMarkers(meshes.markers, markers, cameraReferenceMs, highlight);
  setMarkers(meshes.triangles, triangles, cameraReferenceMs, highlight);
}

function setGuides(
  guides: InstancedMesh<keyof typeof segmentItemSizes>,
  guideYs: number[],
  highlight: SlotHighlight,
) {
  const guideStroke: Stroke = {
    color: votesThresholdLineColor,
    alpha: THRESHOLD_LINE_ALPHA,
    widthPx: 1,
    dashPx: GUIDE_DASH_PX,
    segments: guideYs.flatMap((y) => {
      const crispY = Math.round(y) + 0.5;
      return [0, crispY, 1, crispY];
    }),
    slots: guideYs.map(() => undefined),
  };
  setStrokes(guides, [guideStroke], 0, 0, false, highlight);
}

export function createVotesScene(
  getWasContextLost: ContextHelpers["getWasContextLost"],
) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, 0.5, 10);
  camera.position.z = 1;

  const highlight = createSlotHighlight();
  const strokeUniforms = {
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uDashOffsetPx: { value: 0 },
  };
  const resources: Resources = {
    segmentMaterial: createSegmentMaterial({
      ...strokeUniforms,
      ...highlight.uniforms,
    }),
    // guides never dim, like the other tracks' gridlines
    guideMaterial: createSegmentMaterial({
      ...strokeUniforms,
      ...createSlotHighlight().uniforms,
    }),
    markerMaterial: createMarkerMaterial(highlight),
    unitQuad: createUnitQuad(),
    triangle: createTriangle(),
  };
  const createGuides = () =>
    createInstancedMesh(
      resources.unitQuad,
      resources.guideMaterial,
      segmentItemSizes,
      0,
    );

  const curves = {
    group: new THREE.Group(),
    guides: createGuides(),
    tiles: new Map<bigint, VotesTile>(),
    availableMeshes: [] as GeometryMeshes[],
    ownerBySlot: new Map<number, bigint>(),
    slotVotes: new Map() as ReadonlyMap<number, SlotVotes>,
    layout: undefined as VotesLayout | undefined,
  };
  curves.group.add(curves.guides.mesh);

  const latency = {
    group: new THREE.Group(),
    guides: createGuides(),
    meshes: createGeometryMeshes(resources),
    layout: undefined as VotesLayout | undefined,
    data: undefined as object | undefined,
  };
  latency.group.add(latency.guides.mesh, latency.meshes.group);
  scene.add(curves.group, latency.group);

  const dispose = () => {
    for (const { meshes } of curves.tiles.values()) {
      if (meshes) disposeGeometryMeshes(meshes);
    }
    for (const meshes of curves.availableMeshes) disposeGeometryMeshes(meshes);
    disposeGeometryMeshes(latency.meshes);
    curves.guides.mesh.geometry.dispose();
    latency.guides.mesh.geometry.dispose();
    resources.segmentMaterial.dispose();
    resources.guideMaterial.dispose();
    resources.markerMaterial.dispose();
    resources.unitQuad.dispose();
    resources.triangle.dispose();
    for (const texture of votesScene.iconTextures) texture.dispose();
  };

  const votesScene = {
    scene,
    camera,
    resources,
    highlight,
    curves,
    latency,
    iconTextures: [] as THREE.Texture[],
    certIcons: undefined as CertIconImages | undefined,
    cameraReferenceMs: 0,
    getWasContextLost,
    dispose,
  };
  return votesScene;
}

export type VotesScene = ReturnType<typeof createVotesScene>;

export interface RendererObj extends VotesScene {
  renderer: THREE.WebGLRenderer;
  cleanUp: () => void;
}

export function setUpRenderer(
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
  onIconsLoaded: () => void,
): RendererObj | undefined {
  const created = createRenderer(setUpContextListeners, getWasContextLost);
  if (!created) return;
  const { renderer, cleanUpRenderer } = created;
  const votesScene = createVotesScene(getWasContextLost);

  let isCleanedUp = false;
  loadCertIcons()
    .then((certIcons) => {
      if (isCleanedUp) return;
      setCertIcons(votesScene, certIcons);
      onIconsLoaded();
    })
    .catch(console.error);

  const cleanUp = () => {
    isCleanedUp = true;
    if (!getWasContextLost()) votesScene.dispose();
    cleanUpRenderer();
  };
  return Object.assign(votesScene, { renderer, cleanUp });
}

const tmpSize = new THREE.Vector2();

export function getRendererSize({ renderer }: RendererObj) {
  return renderer.getSize(tmpSize);
}

function invalidateLayouts(votesScene: VotesScene) {
  votesScene.curves.layout = undefined;
  votesScene.latency.layout = undefined;
}

export function resizeVotesScene(
  votesScene: VotesScene,
  widthPx: number,
  heightPx: number,
  pixelRatio: number,
) {
  const { camera, resources } = votesScene;
  for (const material of [
    resources.segmentMaterial,
    resources.markerMaterial,
  ]) {
    (material.uniforms.uResolution.value as THREE.Vector2).set(
      widthPx,
      heightPx,
    );
  }
  resources.segmentMaterial.uniforms.uPixelRatio.value = pixelRatio;
  camera.bottom = heightPx;
  camera.updateProjectionMatrix();
  invalidateLayouts(votesScene);
}

function* getAllGeometryMeshes({ curves, latency }: VotesScene) {
  for (const { meshes } of curves.tiles.values()) {
    if (meshes) yield meshes;
  }
  yield latency.meshes;
}

export function moveVotesCamera(
  votesScene: VotesScene,
  [startMs, endMs]: TsRange,
) {
  const { camera, curves, latency, resources } = votesScene;
  const windowSizeMs = endMs - startMs;
  votesScene.cameraReferenceMs = startMs;
  camera.left = 0;
  camera.right = windowSizeMs;
  camera.updateProjectionMatrix();
  for (const meshes of getAllGeometryMeshes(votesScene)) {
    meshes.group.position.x = meshes.referenceMs - startMs;
  }
  // guides span 0 to 1
  curves.guides.mesh.scale.x = windowSizeMs;
  latency.guides.mesh.scale.x = windowSizeMs;

  const { uniforms } = resources.segmentMaterial;
  const pxPerMs =
    (uniforms.uResolution.value as THREE.Vector2).x / windowSizeMs;
  // dashes move with the timeline instead of the screen
  uniforms.uDashOffsetPx.value = (startMs * pxPerMs) % DASH_PERIOD_PX;
}

export function showVotesView(
  { curves, latency }: VotesScene,
  view: VotesView,
) {
  // hidden tiles stop syncing until the curves are drawn again
  if (view !== "curves") curves.layout = undefined;
  curves.group.visible = view === "curves";
  latency.group.visible = view !== "curves";
}

function buildTile(
  votesScene: VotesScene,
  tile: VotesTile,
  layout: VotesLayout,
) {
  const { curves, resources, camera, certIcons } = votesScene;
  if (!tile.meshes) {
    tile.meshes =
      curves.availableMeshes.pop() ?? createGeometryMeshes(resources);
    curves.group.add(tile.meshes.group);
  }
  const geometry = buildVotes({
    heightPx: camera.bottom,
    slotVotes: tile.slots.flatMap((slot) => curves.slotVotes.get(slot) ?? []),
    markerStyle: layout.markerStyle,
    certIcons,
  });
  setGeometry(
    tile.meshes,
    geometry,
    votesScene.cameraReferenceMs,
    votesScene.highlight,
  );
  tile.meshes.group.visible = true;
  tile.stale = false;
}

function releaseMeshes(votesScene: VotesScene, tile: VotesTile) {
  const { curves } = votesScene;
  const { meshes } = tile;
  if (!meshes) return;
  tile.meshes = undefined;
  curves.group.remove(meshes.group);
  if (curves.availableMeshes.length < MAX_AVAILABLE_MESHES) {
    curves.availableMeshes.push(meshes);
  } else if (!votesScene.getWasContextLost()) {
    disposeGeometryMeshes(meshes);
  }
}

function getDrawnRangeMs(
  slots: number[],
  slotVotes: ReadonlyMap<number, SlotVotes>,
): TsRange | undefined {
  let startMs = Infinity;
  let endMs = -Infinity;
  const include = (ms: number) => {
    startMs = Math.min(startMs, ms);
    endMs = Math.max(endMs, ms);
  };
  for (const slot of slots) {
    const votes = slotVotes.get(slot);
    if (!votes) continue;
    for (const curve of [
      votes.notar,
      votes.notarFallback,
      votes.finalize,
      votes.skipAll,
    ]) {
      if (!curve?.ts.length) continue;
      include(curve.ts[0]);
      include(curve.ts[curve.ts.length - 1]);
    }
    for (const ms of votes.certs.values()) include(ms);
    for (const ms of votes.ownVotes.values()) include(ms);
  }
  return startMs <= endMs ? [startMs, endMs] : undefined;
}

// each slot is drawn by the first tile holding any of its votes
function getOwnerBySlot(dataTiles: VotesDataTile[]) {
  const ownerBySlot = new Map<number, bigint>();
  const sorted = [...dataTiles].sort((a, b) =>
    a.startNs < b.startNs ? -1 : a.startNs > b.startNs ? 1 : 0,
  );
  for (const { startNs, data } of sorted) {
    for (const slot of data.keys()) {
      if (!ownerBySlot.has(slot)) ownerBySlot.set(slot, startNs);
    }
  }
  return ownerBySlot;
}

// marks tiles whose drawn slots changed as stale, and removes evicted ones
export function syncVotesTiles(
  votesScene: VotesScene,
  dataTiles: VotesDataTile[],
  slotVotes: ReadonlyMap<number, SlotVotes>,
  changedStartNs: bigint[],
  rebuild = false,
) {
  const { curves } = votesScene;
  if (!curves.layout) return;

  const ownerBySlot = getOwnerBySlot(dataTiles);
  const tileByStartNs = new Map(dataTiles.map((tile) => [tile.startNs, tile]));
  const changedSlots: number[] = [];
  const dirty = new Set<bigint>();

  for (const startNs of changedStartNs) {
    const tile = tileByStartNs.get(startNs);
    if (tile) changedSlots.push(...tile.data.keys());
  }
  for (const [startNs, tile] of curves.tiles) {
    const dataTile = tileByStartNs.get(startNs);
    if (dataTile) {
      // replaced data may have dropped slots
      if (dataTile.data !== tile.data) {
        changedSlots.push(...tile.data.keys(), ...dataTile.data.keys());
        tile.data = dataTile.data;
      }
      continue;
    }
    changedSlots.push(...tile.data.keys());
    releaseMeshes(votesScene, tile);
    curves.tiles.delete(startNs);
  }
  for (const slot of changedSlots) {
    for (const owner of [curves.ownerBySlot.get(slot), ownerBySlot.get(slot)]) {
      if (owner !== undefined && tileByStartNs.has(owner)) dirty.add(owner);
    }
  }
  for (const startNs of tileByStartNs.keys()) {
    if (rebuild || !curves.tiles.has(startNs)) dirty.add(startNs);
  }
  curves.ownerBySlot = ownerBySlot;
  curves.slotVotes = slotVotes;

  const ownedSlots = new Map<bigint, number[]>();
  for (const [slot, owner] of ownerBySlot) {
    if (!dirty.has(owner)) continue;
    const slots = ownedSlots.get(owner) ?? [];
    slots.push(slot);
    ownedSlots.set(owner, slots);
  }
  for (const startNs of dirty) {
    let tile = curves.tiles.get(startNs);
    if (!tile) {
      tile = {
        data: tileByStartNs.get(startNs)!.data,
        slots: [],
        rangeMs: undefined,
        meshes: undefined,
        stale: true,
      };
      curves.tiles.set(startNs, tile);
    }
    tile.slots = ownedSlots.get(startNs) ?? [];
    tile.rangeMs = getDrawnRangeMs(tile.slots, slotVotes);
    tile.stale = true;
    if (!tile.rangeMs) releaseMeshes(votesScene, tile);
    else if (tile.meshes) tile.meshes.group.visible = false;
  }
}

export function drawVotesCurves(
  votesScene: VotesScene,
  dataTiles: VotesDataTile[],
  slotVotes: ReadonlyMap<number, SlotVotes>,
  layout: VotesLayout,
) {
  const { curves } = votesScene;
  curves.layout = layout;
  setGuides(
    curves.guides,
    getThresholdYs(votesScene.camera.bottom),
    votesScene.highlight,
  );
  syncVotesTiles(votesScene, dataTiles, slotVotes, [], true);
}

// call before each render so no stale tile is in view
export function showNearVotesTiles(votesScene: VotesScene) {
  const { curves, camera, cameraReferenceMs } = votesScene;
  const { layout } = curves;
  if (!layout) return;
  const overscanMs =
    (OVERSCAN_DRAW_TILES_COUNT * Number(VOTES_TILE_NS[layout.granularity])) /
    nsPerMs;
  const startMs = cameraReferenceMs - overscanMs;
  const endMs = cameraReferenceMs + camera.right + overscanMs;
  for (const tile of curves.tiles.values()) {
    const isNear =
      tile.rangeMs !== undefined &&
      tile.rangeMs[0] <= endMs &&
      tile.rangeMs[1] >= startMs;
    if (!tile.stale) {
      // far tiles keep their buffers for panning back
      if (tile.meshes) tile.meshes.group.visible = isNear;
    } else if (isNear) {
      buildTile(votesScene, tile, layout);
    } else {
      releaseMeshes(votesScene, tile);
    }
  }
}

export function isLatencyDrawn(
  { latency }: VotesScene,
  layout: VotesLayout,
  data: object,
) {
  return latency.data === data && isEqual(latency.layout, layout);
}

export function drawVotesLatency(
  votesScene: VotesScene,
  geometry: VotesGeometry & { guideYs: number[] },
  layout: VotesLayout,
  data: object,
) {
  const { latency } = votesScene;
  latency.layout = layout;
  latency.data = data;
  setGuides(latency.guides, geometry.guideYs, votesScene.highlight);
  setGeometry(
    latency.meshes,
    geometry,
    votesScene.cameraReferenceMs,
    votesScene.highlight,
  );
}

function createIconTexture(image: HTMLImageElement) {
  const { widthPx, heightPx } = getIconSizePx(image);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(widthPx * MAX_WEBGL_PX_RATIO);
  canvas.height = Math.ceil(heightPx * MAX_WEBGL_PX_RATIO);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.premultiplyAlpha = true;
  return texture;
}

function setCertIcons(votesScene: VotesScene, certIcons: CertIconImages) {
  for (const texture of votesScene.iconTextures) texture.dispose();
  votesScene.iconTextures = certIconOrder.map((icon) =>
    createIconTexture(certIcons[icon]),
  );
  votesScene.resources.markerMaterial.uniforms.uIcons.value =
    votesScene.iconTextures;
  votesScene.certIcons = certIcons;
  invalidateLayouts(votesScene);
}
