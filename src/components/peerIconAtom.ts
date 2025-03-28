import memoize from "micro-memoize";
import { keyTimeoutAtom } from "../atomUtils";

const peerIconHasErrorAtom = keyTimeoutAtom();

export const getPeerIconHasErrorIcon = memoize(
  (iconUrl: string | null | undefined) => peerIconHasErrorAtom(iconUrl || null),
  { maxSize: 1_000 },
);
