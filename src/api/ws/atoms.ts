import { atom } from "jotai";
import { SocketState } from "./types";

export const socketStateAtom = atom<SocketState>(SocketState.Disconnected);

// True once the first batched ws flush has applied to the atoms; the
// shell stays hidden (dark ground) until then so the first visible
// commit already carries the first-flight data
export const firstFlushAppliedAtom = atom(false);
