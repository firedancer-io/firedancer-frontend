export type TrackId =
  | "shreds"
  | "votes"
  | "income"
  | "banks"
  | "replay"
  | "cpu";

export const trackNames: Record<TrackId, string> = {
  shreds: "Shreds",
  votes: "Votes",
  income: "Income",
  banks: "Execrp",
  replay: "Replay",
  cpu: "CPU",
};

export const trackInsetPx: Record<TrackId, number> = {
  shreds: 0,
  votes: 15,
  income: 24,
  banks: 12,
  replay: 12,
  cpu: 24,
};

export const TRACK_GAP_PX = 6;
export const TRACK_TITLE_PX = 20;
const MAX_GAP_FRACTION = 1 / 4;
export const ROW_LABEL_PX = 13;

export const minTrackPx: Record<TrackId, number> = {
  shreds: 40,
  votes: 80,
  income: 40,
  banks: 40,
  replay: 40,
  cpu: 40,
};

const baseSharePct: Record<TrackId, number> = {
  shreds: 22,
  votes: 16,
  income: 14,
  banks: 30,
  replay: 10,
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
    votes: baseSharePct.votes * restScale,
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

  const rawHeights = splitWithMinimum(
    freePx,
    visible,
    getTrackSharesPct(banksRows, cpuRows),
  );

  let usedPx = 0;
  for (const id of visible) {
    let px = Math.floor(rawHeights.get(id) ?? 0);
    if (id === "banks") px = floorToWholeRows(px, banksRows);
    heights[id] = px;
    usedPx += px;
  }

  const leftoverId = visible.includes("shreds") ? "shreds" : visible[0];
  heights[leftoverId] = (heights[leftoverId] ?? 0) + freePx - usedPx;

  return heights;
}

function splitWithMinimum(
  freePx: number,
  visible: TrackId[],
  shares: Record<TrackId, number>,
) {
  const heights = new Map<TrackId, number>();
  const getMinPx = (id: TrackId) =>
    Math.min(minTrackPx[id], freePx / visible.length);
  let flexible = visible;
  let flexiblePx = freePx;

  const split = (id: TrackId) =>
    (flexiblePx * shares[id]) /
    flexible.reduce((sum, other) => sum + shares[other], 0);

  let tooSmall = flexible.filter((id) => split(id) < getMinPx(id));
  while (tooSmall.length) {
    for (const id of tooSmall) {
      const minPx = getMinPx(id);
      heights.set(id, minPx);
      flexiblePx -= minPx;
    }
    flexible = flexible.filter((id) => !tooSmall.includes(id));
    tooSmall = flexible.filter((id) => split(id) < getMinPx(id));
  }

  for (const id of flexible) heights.set(id, split(id));
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
  gapPx: number;
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
  const getRows = (topPx: number) => {
    const availablePx = Math.max(0, heightPx - topPx);
    const rowGapPx = Math.min(gapPx, (availablePx / count) * MAX_GAP_FRACTION);
    const rowPx = (availablePx - rowGapPx * (count - 1)) / count;
    return { topPx, rowPx, gapPx: rowGapPx };
  };

  let layout = getRows(insetPx);
  if (fillWhenThin && layout.rowPx < ROW_LABEL_PX) layout = getRows(0);

  const labelStep = Math.ceil(
    ROW_LABEL_PX / Math.max(layout.rowPx + layout.gapPx, Number.EPSILON),
  );
  return { ...layout, labelStep };
}

export function isUnderTitle(centerPx: number) {
  return centerPx - ROW_LABEL_PX / 2 < TRACK_TITLE_PX;
}
