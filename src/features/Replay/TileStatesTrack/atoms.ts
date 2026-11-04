import { atom } from "jotai";
import {
  DEFAULT_TILE_STATES_VIEW_OPTS,
  type TileKind,
  type TileStatesViewOpts,
} from "./consts";

export const tileStatesViewOptsAtoms = {
  execrp: atom<TileStatesViewOpts>(DEFAULT_TILE_STATES_VIEW_OPTS),
  replay: atom<TileStatesViewOpts>(DEFAULT_TILE_STATES_VIEW_OPTS),
} satisfies Record<TileKind, unknown>;
