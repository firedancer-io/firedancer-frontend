import { Flex, Text, Tooltip } from "@radix-ui/themes";
import styles from "./slotCardGrid.module.css";
import { useAtomValue } from "jotai";
import {
  currentSlotAtom,
  getSlotStatus,
  slotDurationAtom,
} from "../../../atoms";
import { useEffect, useMemo, useRef, useState } from "react";
import "react-circular-progressbar/dist/styles.css";
import useSlotQuery from "../../../hooks/useSlotQuery";
import { SlotPublish } from "../../../api/types";
import processedIcon from "../../../assets/checkOutline.svg";
import optimisticalyConfirmedIcon from "../../../assets/checkFill.svg";
import rootedIcon from "../../../assets/Rooted.svg";
import skippedIcon from "../../../assets/Skipped.svg";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import { fixValue } from "../../../utils";
import { useRafLoop } from "react-use";

interface SlotCardGridProps {
  slot: number;
  currentSlot?: number;
}

export default function SlotCardGrid({ slot, currentSlot }: SlotCardGridProps) {
  return (
    <div className={styles.grid}>
      <Text className={styles.headerText}>Slot</Text>
      <Text className={styles.headerText}>Transactions</Text>
      <Text className={styles.headerText}>Duration</Text>
      <Text className={styles.headerText}>Compute&nbsp;Units</Text>
      {new Array(4).fill(0).map((_, i) => {
        const cardSlot = slot + i;
        return (
          <SlotCardRow
            key={cardSlot}
            slot={cardSlot}
            active={cardSlot === currentSlot}
          />
        );
      })}
    </div>
  );
}

interface RowValues {
  txnsConfirmed: number;
  totalTxns: number;
  durationText: string;
  computeUnitsText: string;
  isSkipped: boolean;
}

interface SlotCardRowProps {
  slot: number;
  active?: boolean;
}

function SlotCardRow({ slot, active }: SlotCardRowProps) {
  const currentSlot = useAtomValue(currentSlotAtom);
  const response = useSlotQuery(slot);

  const [values, setValues] = useState<RowValues | undefined>();

  useEffect(() => {
    const getValues = (publish: SlotPublish): RowValues => {
      // TODO: fix backend
      const txnsFailed = fixValue(publish.failed_transactions ?? 0);
      const totalTxns = fixValue(publish.transactions ?? 0);
      const txnsConfirmed = totalTxns - txnsFailed;

      const durationText =
        publish.duration_nanos !== null
          ? `${Math.trunc(publish.duration_nanos / 1_000_000)} ms`
          : "-";
      const isSkipped = publish.skipped;

      const computeUnits = fixValue(publish?.compute_units ?? 0);
      const computeUnitPct =
        publish.compute_units != null
          ? (publish.compute_units / 48_000_000) * 100
          : 0;
      const computeUnitsText = `${computeUnits.toLocaleString()} (${computeUnitPct?.toFixed(0)}%)`;

      return {
        txnsConfirmed,
        totalTxns,
        durationText,
        computeUnitsText,
        isSkipped,
      };
    };

    if (response.slotResponse?.publish) {
      setValues(getValues(response.slotResponse.publish));
    }
  }, [response.slotResponse?.publish, slot]);

  const isFuture = slot > (currentSlot ?? Infinity);
  const isCurrent = slot === currentSlot;

  const getText = (text?: string | number, suffix?: string) => {
    if (typeof text === "number") text = Math.trunc(text);
    if (isFuture || isCurrent) return "-";
    // if (isCurrent) return "Calculating...";
    if (!values && !response.hasWaitedForData) return "Loading...";
    if (!values) return "-";
    return `${text}${suffix ?? ""}`;
  };

  return (
    <>
      <Flex
        className={`${styles.rowText} ${active ? styles.active : ""}`}
        align="center"
        gap="2"
      >
        <Text className={styles.slotText}>{slot}</Text>
        <StatusIcon slot={slot} isCurrent={isCurrent} />
        {!!values?.isSkipped && (
          <Tooltip content="Slot was skipped">
            <img src={skippedIcon} alt="skipped" className={styles.icon} />
          </Tooltip>
        )}
      </Flex>
      <Text className={`${styles.rowText} ${active ? styles.active : ""}`}>
        {getText(`${values?.txnsConfirmed} / ${values?.totalTxns}`)}
      </Text>
      <Text className={`${styles.rowText} ${active ? styles.active : ""}`}>
        {getText(values?.durationText)}
      </Text>
      <Text className={`${styles.rowText} ${active ? styles.active : ""}`}>
        {getText(values?.computeUnitsText)}
      </Text>
    </>
  );
}

function StatusIcon({ slot, isCurrent }: { slot: number; isCurrent: boolean }) {
  const status = useAtomValue(useMemo(() => getSlotStatus(slot), [slot]));

  if (isCurrent) return <LoadingIcon />;

  if (status === "incomplete") return null;

  if (status === "optimistically_confirmed") {
    return (
      <Tooltip content="Slot was optimistically confirmed">
        <img
          src={optimisticalyConfirmedIcon}
          alt="optimistically_confirmed"
          className={styles.icon}
        />
      </Tooltip>
    );
  }

  if (status === "rooted" || status === "finalized") {
    return (
      <Tooltip content="Slot was rooted">
        <img src={rootedIcon} alt="rooted" className={styles.icon} />
      </Tooltip>
    );
  }

  return (
    <Tooltip content="Slot was processed">
      <img src={processedIcon} alt="processed" className={styles.icon} />
    </Tooltip>
  );
}

function LoadingIcon() {
  const startRef = useRef(performance.now());
  const slotDuration = useAtomValue(slotDurationAtom);
  const [progress, setProgress] = useState(0);

  useRafLoop(() => {
    if (progress >= 100) return;

    const endTime = performance.now();
    const diff = endTime - startRef.current;
    const newProgress = Math.max((diff / slotDuration) * 100, 100);
    setProgress(newProgress);
  });

  return (
    <div style={{ width: "14px" }}>
      <CircularProgressbar
        value={progress}
        styles={buildStyles({ trailColor: "#666666", pathColor: "#0051DF" })}
        strokeWidth={25}
      />
    </div>
  );
}