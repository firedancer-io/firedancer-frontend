export type TrackId = "shreds" | "income" | "banks" | "replay" | "cpu";

export const trackNames: Record<TrackId, string> = {
  shreds: "Shreds",
  income: "Income",
  banks: "Execrp",
  replay: "Replay",
  cpu: "CPU",
};

export const trackInsetPx: Record<TrackId, number> = {
  shreds: 0,
  income: 24,
  banks: 12,
  replay: 12,
  cpu: 24,
};

export const TRACK_GAP_PX = 6;
export const TRACK_TITLE_PX = 20;
const ROW_LABEL_PX = 13;

const baseSharePct: Record<TrackId | "votes", number> = {
  shreds: 22,
  votes: 9,
  income: 19,
  banks: 35,
  replay: 7,
  cpu: 8,
};

const GROWTH_PCT_PER_ROW = 3;
const BANKS_BASE_ROWS = 10;
const CPU_BASE_ROWS = 2;
const MAX_GROWN_SHARE_PCT = 45;

function grownShare(basePct: number, rows: number, baseRows: number) {
  return Math.min(
    MAX_GROWN_SHARE_PCT,
    basePct + GROWTH_PCT_PER_ROW * Math.max(0, rows - baseRows),
  );
}

export function getTrackSharesPct(banksRows: number, cpuRows: number) {
  const banks = grownShare(baseSharePct.banks, banksRows, BANKS_BASE_ROWS);
  const cpu = grownShare(baseSharePct.cpu, cpuRows, CPU_BASE_ROWS);
  const restBase =
    baseSharePct.shreds +
    baseSharePct.votes +
    baseSharePct.income +
    baseSharePct.replay;
  const restScale = (100 - banks - cpu) / restBase;
  return {
    shreds: baseSharePct.shreds * restScale,
    income: baseSharePct.income * restScale,
    banks,
    replay: baseSharePct.replay * restScale,
    cpu,
  } satisfies Record<TrackId, number>;
}

interface TrackLayoutInput {
  heightPx: number;
  tracks: TrackId[];
  hidden: ReadonlySet<TrackId>;
  banksRows: number;
  cpuRows: number;
}

type TrackHeights = Partial<Record<TrackId, number>>;

export function getTrackHeights({
  heightPx,
  tracks,
  hidden,
  banksRows,
  cpuRows,
}: TrackLayoutInput): TrackHeights {
  const heights: TrackHeights = {};
  const visible = tracks.filter((id) => !hidden.has(id));
  const gapsPx = TRACK_GAP_PX * (tracks.length - 1);
  const hiddenPx = TRACK_TITLE_PX * (tracks.length - visible.length);
  const freePx = Math.max(0, Math.floor(heightPx) - gapsPx - hiddenPx);

  for (const id of tracks) {
    if (hidden.has(id)) heights[id] = TRACK_TITLE_PX;
  }
  if (!visible.length) return heights;

  const shares = getTrackSharesPct(banksRows, cpuRows);
  const totalShare = visible.reduce((sum, id) => sum + shares[id], 0);

  let usedPx = 0;
  for (const id of visible) {
    let px = Math.floor((freePx * shares[id]) / totalShare);
    if (id === "banks") px = floorToWholeRows(px, banksRows);
    heights[id] = px;
    usedPx += px;
  }

  const leftoverId = visible.includes("shreds") ? "shreds" : visible[0];
  heights[leftoverId] = (heights[leftoverId] ?? 0) + freePx - usedPx;

  return heights;
}

function floorToWholeRows(heightPx: number, rows: number) {
  const count = Math.max(rows, 1);
  const rowPx = Math.floor((heightPx - trackInsetPx.banks) / count);
  if (rowPx < 1) return heightPx;
  return trackInsetPx.banks + count * rowPx;
}

export interface RowsLayout {
  topPx: number;
  rowPx: number;
  labelStep: number;
}

interface RowsLayoutOpts {
  insetPx: number;
  fillWhenThin?: boolean;
  gapPx?: number;
}

export function getRowsLayout(
  heightPx: number,
  rows: number,
  { insetPx, fillWhenThin = false, gapPx = 0 }: RowsLayoutOpts,
): RowsLayout {
  const count = Math.max(rows, 1);
  const getRowPx = (topPx: number) =>
    Math.max(0, (heightPx - topPx - gapPx * (count - 1)) / count);

  let topPx = insetPx;
  let rowPx = getRowPx(topPx);
  if (fillWhenThin && rowPx < ROW_LABEL_PX) {
    topPx = 0;
    rowPx = getRowPx(topPx);
  }

  const labelStep = Math.ceil(ROW_LABEL_PX / Math.max(rowPx + gapPx, 1));
  return { topPx, rowPx, labelStep };
}

export function isUnderTitle(centerPx: number) {
  return centerPx - ROW_LABEL_PX / 2 < TRACK_TITLE_PX;
}
