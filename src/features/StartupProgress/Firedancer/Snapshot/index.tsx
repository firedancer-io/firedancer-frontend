import { Flex } from "@radix-ui/themes";
import bodyStyles from "../body.module.css";
import { useMedia } from "react-use";
import { useAtomValue } from "jotai";
import { bootProgressAtom } from "../../../../api/atoms";
import { BootPhaseEnum } from "../../../../api/entities";
import SnapshotSparklineCard from "./SnapshotSparklineCard";
import { SnapshotReadingCard } from "./SnapshotReadingCard";
import { SnapshotDecompressingCard } from "./SnapshotDecompressingCard";
import { SnapshotInsertingCard } from "./SnapshotInsertingCard";
import PhaseHeader from "../PhaseHeader";
import { useEffect } from "react";
import { useEma } from "../../../../hooks/useEma";
import { useOverallCompleteFraction } from "../useOverallCompleteFraction";
import { getSnapshotValues } from "./utils";

const rowGap = "5";
const columnGap = "26px";

export default function Snapshot() {
  const bootProgress = useAtomValue(bootProgressAtom);
  const isIncremental =
    bootProgress?.phase === BootPhaseEnum.loading_incremental_snapshot;
  const isNarrowScreen = useMedia("(max-width: 560px)");
  const wrap = isNarrowScreen ? "wrap" : "nowrap";
  const gap = isNarrowScreen ? columnGap : rowGap;

  const snapshotValues = bootProgress
    ? getSnapshotValues(bootProgress)
    : undefined;

  const { ema: decompressedInputThroughput, reset: resetInsertThroughput } =
    useEma(snapshotValues?.insertDecompressedBytes);

  const { ema: writtenThroughput, reset: resetWrittenThroughput } = useEma(
    snapshotValues?.insertBytesWritten,
  );

  useEffect(() => {
    // reset throughput history on phase change
    resetInsertThroughput();
    resetWrittenThroughput();
  }, [bootProgress?.phase, resetInsertThroughput, resetWrittenThroughput]);

  const {
    totalCompressedBytes,
    readCompressedBytes,
    readPath,
    decompressCompressedBytes,
    decompressDecompressedBytes,
    insertDecompressedBytes,
    insertCompressedBytes,
    insertAccounts,
    totalDecompressedBytes,
    accountsDatabasePath,
  } = snapshotValues ?? {};

  const insertRemainingSeconds =
    !decompressedInputThroughput ||
    totalDecompressedBytes == null ||
    insertDecompressedBytes == null
      ? undefined
      : Math.round(
          (totalDecompressedBytes - insertDecompressedBytes) /
            decompressedInputThroughput,
        );

  const insertCompleteFraction = Math.min(
    totalCompressedBytes && insertCompressedBytes
      ? insertCompressedBytes / totalCompressedBytes
      : 0,
    1,
  );

  const remainingSeconds = insertRemainingSeconds;
  const phaseCompleteFraction = insertCompleteFraction;

  const overallCompleteFraction = useOverallCompleteFraction(
    phaseCompleteFraction,
  );

  if (!bootProgress || !snapshotValues) return;

  return (
    <>
      <PhaseHeader
        phaseCompleteFraction={phaseCompleteFraction}
        overallCompleteFraction={overallCompleteFraction}
        remainingSeconds={remainingSeconds}
      />
      <Flex
        mt="52px"
        direction="column"
        gap={columnGap}
        className={bodyStyles.startupContentIndentation}
      >
        <Flex gap={gap} wrap={wrap}>
          <SnapshotReadingCard
            compressedCompleted={readCompressedBytes}
            compressedTotal={totalCompressedBytes}
            path={readPath}
          />
          <SnapshotSparklineCard
            title="CPU Utilization"
            tileType="snapld"
            isComplete={
              isIncremental &&
              !!readCompressedBytes &&
              readCompressedBytes === totalCompressedBytes
            }
          />
        </Flex>

        <Flex gap={gap} wrap={wrap}>
          <SnapshotDecompressingCard
            compressedCompleted={decompressCompressedBytes}
            decompressedCompleted={decompressDecompressedBytes}
            compressedTotal={totalCompressedBytes}
          />
          <SnapshotSparklineCard
            title="CPU Utilization"
            tileType="snapdc"
            isComplete={
              isIncremental &&
              !!decompressCompressedBytes &&
              decompressCompressedBytes === totalCompressedBytes
            }
          />
        </Flex>

        <Flex gap={gap} wrap={wrap}>
          <SnapshotInsertingCard
            emaDecompressedThroughput={decompressedInputThroughput}
            decompressedCompleted={insertDecompressedBytes}
            decompressedTotal={totalDecompressedBytes}
            cumulativeAccounts={insertAccounts}
            emaWrittenThroughput={writtenThroughput}
            path={accountsDatabasePath}
          />
          <SnapshotSparklineCard
            title="CPU Utilization"
            tileType="snapin"
            isComplete={
              isIncremental &&
              !!insertCompressedBytes &&
              insertCompressedBytes === totalCompressedBytes
            }
          />
        </Flex>
      </Flex>
    </>
  );
}
