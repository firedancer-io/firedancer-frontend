import { atom } from "jotai";
import { bootProgressAtom } from "../../api/atoms";
import { BootPhaseEnum, ClientEnum } from "../../api/entities";
import type { BootProgress } from "../../api/types";
import { clientAtom } from "../../atoms";

export const bootProgressPhaseAtom = atom<BootProgress["phase"] | undefined>(
  (get) => get(bootProgressAtom)?.phase,
);

export const showStartupProgressAtom = atom(true);
export const isStartupProgressExpandedAtom = atom(true);
export const expandStartupProgressElAtom = atom<HTMLButtonElement | null>(null);

export const isStartupProgressVisibleAtom = atom((get) => {
  const showStartupProgress = get(showStartupProgressAtom);
  if (!showStartupProgress) return false;

  const client = get(clientAtom);
  if (client === ClientEnum.Frankendancer) {
    return showStartupProgress;
  } else if (client === ClientEnum.Firedancer) {
    return showStartupProgress && get(isStartupProgressExpandedAtom);
  }
  return true;
});

export const bootProgressBarPctAtom = atom((get) => {
  const bootProgress = get(bootProgressAtom);
  if (!bootProgress) return 0;

  switch (bootProgress.phase) {
    case BootPhaseEnum.joining_gossip: {
      return 0;
    }
    case BootPhaseEnum.loading_full_snapshot: {
      const total = bootProgress.loading_full_snapshot_total_bytes_compressed;
      const insert =
        bootProgress.loading_full_snapshot_insert_bytes_decompressed;
      const decompress_compressed =
        bootProgress.loading_full_snapshot_decompress_bytes_compressed;
      const decompress_decompressed =
        bootProgress.loading_full_snapshot_decompress_bytes_decompressed;

      if (
        !insert ||
        !decompress_compressed ||
        !decompress_decompressed ||
        !total
      ) {
        return 0;
      }

      const insertCompleted =
        insert * (decompress_compressed / decompress_decompressed);

      return Math.min(100, (insertCompleted / total) * 100);
    }
    case BootPhaseEnum.loading_incremental_snapshot: {
      const total =
        bootProgress.loading_incremental_snapshot_total_bytes_compressed;
      const insert =
        bootProgress.loading_incremental_snapshot_insert_bytes_decompressed;
      const decompress_compressed =
        bootProgress.loading_incremental_snapshot_decompress_bytes_decompressed;
      const decompress_decompressed =
        bootProgress.loading_incremental_snapshot_decompress_bytes_decompressed;

      if (
        !insert ||
        !decompress_compressed ||
        !decompress_decompressed ||
        !total
      ) {
        return 0;
      }

      const insertCompleted =
        insert * (decompress_compressed / decompress_decompressed);

      return Math.min(100, (insertCompleted / total) * 100);
    }
    case BootPhaseEnum.catching_up: {
      return 0;
    }
    case BootPhaseEnum.running: {
      return 0;
    }
  }
});
