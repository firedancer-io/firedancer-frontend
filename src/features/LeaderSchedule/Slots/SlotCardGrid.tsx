import { Flex, Grid, Text, Tooltip } from "@radix-ui/themes";
import styles from "./slotCardGrid.module.css";
import { useAtomValue, useSetAtom } from "jotai";
import {
  currentSlotAtom,
  firstProcessedSlotAtom,
  getSlotStatus,
  slotDurationAtom,
} from "../../../atoms";
import { useEffect, useMemo, useRef, useState } from "react";
import "react-circular-progressbar/dist/styles.css";
import { useSlotQueryPublish } from "../../../hooks/useSlotQuery";
import { SlotPublish } from "../../../api/types";
import processedIcon from "../../../assets/checkOutline.svg";
import optimisticalyConfirmedIcon from "../../../assets/checkFill.svg";
import rootedIcon from "../../../assets/Rooted.svg";
import skippedIcon from "../../../assets/Skipped.svg";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import { fixValue } from "../../../utils";
import { useMedia, usePrevious, useRafLoop, useUnmount } from "react-use";
import { lamportsPerSol } from "../../../consts";
import { formatNumberLamports } from "../../Overview/ValidatorsCard/formatAmt";
import {
  setScrollFuncsAtom,
  deleteScrollFuncsAtom,
  scrollAllFuncsAtom,
} from "./atoms";
import clsx from "clsx";

interface SlotCardGridProps {
  slot: number;
  currentSlot?: number;
}

export default function SlotCardGrid({ slot, currentSlot }: SlotCardGridProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const setScroll = useSetAtom(setScrollFuncsAtom);
  const deleteScroll = useSetAtom(deleteScrollFuncsAtom);
  const scrollAll = useSetAtom(scrollAllFuncsAtom);

  useEffect(() => {
    setScroll(slot, (scrollLeft: number) => {
      ref.current?.scrollTo(scrollLeft, 0);
    });
    return () => deleteScroll(slot);
  }, [deleteScroll, setScroll, slot]);

  return (
    <Flex minWidth="0">
      <SlotColumn slot={slot} currentSlot={currentSlot} />
      <div
        className={styles.grid}
        ref={ref}
        onScroll={(e) => {
          scrollAll(slot, e.currentTarget.scrollLeft);
        }}
      >
        <Text className={styles.headerText} align="right">
          Votes
        </Text>
        <Text className={styles.headerText} align="right">
          Non-votes
        </Text>
        <Text className={styles.headerText} align="right">
          Fees
        </Text>
        <Text className={styles.headerText} align="right">
          Tips
        </Text>
        <Text className={styles.headerText} align="right">
          Duration
        </Text>
        <Text
          className={styles.headerText}
          align="right"
          style={{ gridColumnStart: "span 2" }}
        >
          Compute&nbsp;Units
        </Text>
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
    </Flex>
  );
}

interface SlotCardGridProps {
  slot: number;
  currentSlot?: number;
}

function SlotColumn({ slot, currentSlot }: SlotCardGridProps) {
  const isWideScreen = useMedia("(min-width: 700px)");

  return (
    <Flex direction="column" gap="1px">
      <Text className={styles.headerText}>
        {isWideScreen ? "Slot" : "\u00A0"}
      </Text>
      {new Array(4).fill(0).map((_, i) => {
        const cardSlot = slot + i;
        const isCurrent = cardSlot === currentSlot;

        return (
          <SlotText
            key={cardSlot}
            slot={cardSlot}
            isCurrent={isCurrent}
            isWideScreen={isWideScreen}
          />
        );
      })}
    </Flex>
  );
}

interface SlotTextProps {
  slot: number;
  isCurrent: boolean;
}

function SlotText({
  slot,
  isCurrent,
  isWideScreen,
}: SlotTextProps & { isWideScreen: boolean }) {
  const queryPublish = useSlotQueryPublish(slot);

  return (
    <Flex
      className={clsx(styles.rowText, {
        [styles.active]: isCurrent,
        [styles.narrowScreen]: !isWideScreen,
      })}
      align="center"
      gap={isWideScreen ? "2" : "0"}
    >
      {isWideScreen ? (
        <Text className={styles.slotText}>{slot}</Text>
      ) : (
        <Text>&nbsp;</Text>
      )}
      <StatusIcon slot={slot} isCurrent={isCurrent} />
      {queryPublish.publish?.skipped ? (
        <Tooltip content="Slot was skipped">
          <img src={skippedIcon} alt="skipped" className={styles.icon} />
        </Tooltip>
      ) : (
        <div className={styles.icon} />
      )}
    </Flex>
  );
}

interface RowValues {
  voteTxns: string;
  nonVoteTxns: string;
  totalFees: string;
  transactionFeeFull: string;
  priorityFeeFull: string;
  tips: string;
  tipsFull: string;
  durationText: string;
  computeUnits: number;
  computeUnitsPct: number;
}

interface SlotCardRowProps {
  slot: number;
  active?: boolean;
}

function getRowValues(publish: SlotPublish): RowValues {
  // TODO: fix backend
  const voteTxns = fixValue(publish.vote_transactions ?? 0);
  const totalTxns = fixValue(publish.transactions ?? 0);
  const nonVoteTxns = totalTxns - voteTxns;
  const totalFees = formatNumberLamports(
    (publish.transaction_fee ?? 0n) + (publish.priority_fee ?? 0n),
    3,
    {
      decimals: 3,
      trailingZeroes: true,
    },
  );

  const transactionFeeFull =
    publish.transaction_fee != null
      ? (Number(publish.transaction_fee) / lamportsPerSol).toString()
      : "0";

  const priorityFeeFull =
    publish.priority_fee != null
      ? (Number(publish.priority_fee) / lamportsPerSol).toString()
      : "0";

  const tips = formatNumberLamports(publish.tips ?? 0n, 3, {
    decimals: 3,
    trailingZeroes: true,
  });
  const tipsFull =
    publish.tips != null
      ? (Number(publish.tips) / lamportsPerSol).toString()
      : "0";

  const durationText =
    publish.duration_nanos !== null
      ? `${Math.trunc(publish.duration_nanos / 1_000_000)} ms`
      : "-";

  const computeUnits = fixValue(publish?.compute_units ?? 0);
  const computeUnitsPct =
    publish.compute_units != null
      ? (publish.compute_units / (publish.max_compute_units ?? 48_000_000)) *
        100
      : 0;

  return {
    voteTxns: voteTxns.toLocaleString(),
    nonVoteTxns: nonVoteTxns.toLocaleString(),
    totalFees,
    transactionFeeFull,
    priorityFeeFull,
    tips,
    tipsFull,
    durationText,
    computeUnits,
    computeUnitsPct,
  };
}

function SlotCardRow({ slot, active }: SlotCardRowProps) {
  const firstProcessedSlot = useAtomValue(firstProcessedSlotAtom);
  const currentSlot = useAtomValue(currentSlotAtom);
  const queryPublish = useSlotQueryPublish(slot);

  const [values, setValues] = useState<RowValues | undefined>(() => {
    if (!queryPublish.publish) return;
    return getRowValues(queryPublish.publish);
  });

  useEffect(() => {
    if (queryPublish.publish) {
      setValues(getRowValues(queryPublish.publish));
    }
  }, [queryPublish.publish, slot]);

  const isFuture = slot > (currentSlot ?? Infinity);
  const isCurrent = slot === currentSlot;

  const timeoutRef = useRef<NodeJS.Timeout>();
  const [isRecentlyCurrent, setIsRecentlyCurrent] = useState(false);
  const prevIsCurrent = usePrevious(isCurrent);

  if (prevIsCurrent && !isCurrent && !isRecentlyCurrent) {
    // If recently switched from current to not current,
    // delay loading text to prevent flickering transitions
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsRecentlyCurrent(false);
    }, 50);
    setIsRecentlyCurrent(true);
  }

  useUnmount(() => {
    clearTimeout(timeoutRef.current);
  });

  const isSnapshot = slot < (firstProcessedSlot ?? 0);

  const getText = (text?: string | number, suffix?: string) => {
    if (isFuture || isCurrent || isSnapshot) return "-";
    if (!values && !queryPublish.hasWaitedForData && !isRecentlyCurrent)
      return "Loading...";
    if (!values) return "-";

    if (typeof text === "number") text = Math.round(text);
    return `${text}${suffix ?? ""}`;
  };

  return (
    <>
      <Text
        className={`${styles.rowText} ${active ? styles.active : ""}`}
        align="right"
      >
        {getText(values?.voteTxns)}
      </Text>
      <Text
        className={`${styles.rowText} ${active ? styles.active : ""}`}
        align="right"
      >
        {getText(values?.nonVoteTxns)}
      </Text>
      <Tooltip
        content={
          <Grid columns="auto auto" rows="2" gapX="3">
            <Text>Transaction</Text>
            <Text>Priority</Text>
            <Text>{values?.transactionFeeFull} SOL</Text>
            <Text>{values?.priorityFeeFull} SOL</Text>
          </Grid>
        }
      >
        <Text
          className={`${styles.rowText} ${active ? styles.active : ""}`}
          align="right"
        >
          {getText(values?.totalFees)}
        </Text>
      </Tooltip>
      <Tooltip content={`${values?.tipsFull} SOL`}>
        <Text
          className={`${styles.rowText} ${active ? styles.active : ""}`}
          align="right"
        >
          {getText(values?.tips)}
        </Text>
      </Tooltip>
      <Text
        className={`${styles.rowText} ${active ? styles.active : ""}`}
        align="right"
      >
        {getText(values?.durationText)}
      </Text>
      {values?.computeUnits !== undefined ? (
        <>
          <Text
            className={`${styles.rowText} ${active ? styles.active : ""}`}
            align="right"
            style={{ padding: 0 }}
          >
            {getText(values?.computeUnits.toLocaleString())}
          </Text>
          <Text
            className={`${styles.rowText} ${active ? styles.active : ""}`}
            align="right"
            style={{ padding: 0 }}
          >
            {values?.computeUnitsPct !== undefined
              ? `\u00A0(${getText(values?.computeUnitsPct)}%)`
              : null}
          </Text>
        </>
      ) : (
        <Text
          className={`${styles.rowText} ${active ? styles.active : ""}`}
          style={{ gridColumnStart: "span 2" }}
          align="right"
        >
          {getText()}
        </Text>
      )}
    </>
  );
}

function StatusIcon({ slot, isCurrent }: { slot: number; isCurrent: boolean }) {
  const status = useAtomValue(useMemo(() => getSlotStatus(slot), [slot]));

  if (isCurrent) return <LoadingIcon />;

  if (status === "incomplete") return <div className={styles.icon} />;

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
