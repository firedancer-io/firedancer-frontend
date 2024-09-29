import { atom } from "jotai";
import { SocketState } from "./types";

export const socketStateAtom = atom<SocketState>(SocketState.Disconnected);
