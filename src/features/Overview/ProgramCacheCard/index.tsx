import { Flex } from "@radix-ui/themes";
import CardHeader from "../../../components/CardHeader";
import Card from "../../../components/Card";
import CardStat from "../../../components/CardStat";
import styles from "./programCacheCard.module.css";
import { useAtomValue } from "jotai";
import { liveProgramCacheAtom } from "../../../api/atoms";
import { formatBytes } from "../../../utils";
import { useMemo } from "react";
import HitRateStat from "./HitRateStat";
import StorageStat from "./StorageStat";
import { programCacheColor } from "../../../colors";

export default function ProgramCacheCard() {
  return (
    <Card>
      <Flex direction="column" height="100%" gap="2" align="start">
        <CardHeader text="Program Cache" />
        <div className={styles.statRow}>
          <HitRateStat />
          <StorageStat />
        </div>
        <div className={styles.statRow}>
          <ProgramCacheStats />
        </div>
      </Flex>
    </Card>
  );
}

function ProgramCacheStats() {
  const liveProgramCache = useAtomValue(liveProgramCacheAtom);

  return (
    <>
      <ProgramCacheText
        label="Insertions"
        numTimes={liveProgramCache?.insertions}
        bytes={liveProgramCache?.insertion_bytes}
      />
      <ProgramCacheText
        label="Evictions"
        numTimes={liveProgramCache?.evictions}
        bytes={liveProgramCache?.eviction_bytes}
      />
      <ProgramCacheText
        label="Spills"
        numTimes={liveProgramCache?.spills}
        bytes={liveProgramCache?.spill_bytes}
      />
    </>
  );
}

function ProgramCacheText({
  label,
  numTimes,
  bytes,
}: {
  label: string;
  numTimes?: number;
  bytes?: number;
}) {
  const { value, appendValue } = useMemo(() => {
    const fmtBytes = bytes !== undefined ? formatBytes(bytes) : undefined;

    return {
      value: numTimes !== undefined ? numTimes.toLocaleString() : "-",
      appendValue: fmtBytes
        ? ` (${fmtBytes.value} ${fmtBytes.unit})`
        : undefined,
    };
  }, [bytes, numTimes]);

  return (
    <CardStat
      label={label}
      value={value}
      valueColor={programCacheColor}
      valueSize="small"
      appendValue={appendValue}
    />
  );
}
