import { Card, Flex, Text } from "@radix-ui/themes";
import styles from "./snapshot.module.css";
import clsx from "clsx";
import { Bars } from "../Bars";
import { useValuePerSecond } from "../useValuePerSecond";
import { bootProgressPhaseAtom } from "../../atoms";
import { useAtomValue } from "jotai";
import { memo, useEffect, useMemo } from "react";
import StorageIcon from "@material-design-icons/svg/filled/storage.svg?react";
import { compactSingleDecimalFormatter } from "../../../../numUtils";
import Progress from "../../../../components/Progress";
import { formatByteValue } from "./utils";

const gap = "4px";

interface SnapshotBarsCardProps {
  title: string;
  progressPct: number | undefined;
  completed: number | null | undefined;
  total: number | null | undefined;
  barsThroughput: number | null | undefined;
  maxThroughput: number;
  headerRightContent: JSX.Element;
  footerText?: string | null;
}
export function SnapshotBarsCard({
  title,
  progressPct,
  completed,
  total,
  barsThroughput,
  maxThroughput,
  headerRightContent,
  footerText,
}: SnapshotBarsCardProps) {
  return (
    <Card className={clsx(styles.card, styles.barsCard)}>
      <Flex direction="column" gap="2px">
        <ProgressBar pct={progressPct} />
        <Flex
          justify="between"
          wrap="nowrap"
          gap={gap}
          className={styles.cardHeader}
        >
          <SnapshotTitle text={title} />
          <Flex gap={gap} minWidth="0" className={styles.headerRightSection}>
            <SnapshotTotalComplete completed={completed} total={total} />
            {headerRightContent}
          </Flex>
        </Flex>
      </Flex>
      <Bars value={barsThroughput ?? 0} max={maxThroughput} />

      <MSnapshotPath path={footerText} />
    </Card>
  );
}

interface ProgressBarProps {
  pct: number | undefined;
}
function ProgressBar({ pct }: ProgressBarProps) {
  const bootPhase = useAtomValue(bootProgressPhaseAtom);
  // jump to inital value on phase change
  return (
    <Flex key={bootPhase} gap="10px" align="center">
      <Progress className={styles.progressBar} value={pct ?? 0} />
      <Text className={clsx(styles.secondaryColor, styles.progressPctText)}>
        {pct == null ? "-" : pct.toFixed(0)}%
      </Text>
    </Flex>
  );
}

function ValueUnitText({
  value,
  unit,
}: {
  value?: string | number;
  unit?: string;
}) {
  return (
    <>
      <Text>{value ?? "--"}</Text>
      {unit && <Text className={styles.secondaryColor}> {unit}</Text>}
    </>
  );
}

interface SnapshotTitleProps {
  text: string;
}
function SnapshotTitle({ text }: SnapshotTitleProps) {
  return <Text className={clsx(styles.leftColumn, styles.title)}>{text}</Text>;
}

interface AccountsRateProps {
  isComplete: boolean;
  cumulativeAccounts?: number | null;
}
export function AccountsRate({
  isComplete,
  cumulativeAccounts,
}: AccountsRateProps) {
  const phase = useAtomValue(bootProgressPhaseAtom);

  const { valuePerSecond: accountsPerSecond, reset } = useValuePerSecond(
    cumulativeAccounts,
    1_000,
  );

  useEffect(() => {
    // reset throughput history on phase change
    reset();
  }, [phase, reset]);

  const value = useMemo(() => {
    if (isComplete) return 0;
    // Possible to have no rate due to only having a single point
    if (cumulativeAccounts != null && accountsPerSecond == null) return "0";
    if (accountsPerSecond == null) return;
    return compactSingleDecimalFormatter.format(accountsPerSecond);
  }, [accountsPerSecond, cumulativeAccounts, isComplete]);

  return (
    <div className={styles.rightColumn}>
      <ValueUnitText value={value} unit="Accounts / sec" />
    </div>
  );
}

interface SnapshotTotalCompleteProps {
  completed: number | null | undefined;
  total: number | null | undefined;
}
function SnapshotTotalComplete({
  completed,
  total,
}: SnapshotTotalCompleteProps) {
  const completedObj = formatByteValue(completed);
  const totalObj = formatByteValue(total);

  return (
    <Flex className={styles.centerColumn}>
      <ValueUnitText value={completedObj?.value} unit={completedObj?.unit} />

      <Text> / </Text>

      <ValueUnitText value={totalObj?.value} unit={totalObj?.unit} />
    </Flex>
  );
}

interface SnapshotThroughputProps {
  prefix?: string;
  throughput: number | null | undefined;
}
export function SnapshotThroughput({
  prefix,
  throughput,
}: SnapshotThroughputProps) {
  const throughputObj = formatByteValue(throughput);

  return (
    <div className={styles.rightColumn}>
      {prefix && <Text className={styles.secondaryColor}>{prefix} </Text>}
      <ValueUnitText value={throughputObj?.value} unit={throughputObj?.unit} />
      <Text className={styles.secondaryColor}>/sec</Text>
    </div>
  );
}

interface SnapshotPathProps {
  path?: string | null;
}
const MSnapshotPath = memo(function SnapshotPath({ path }: SnapshotPathProps) {
  if (!path) return;
  return (
    <Flex
      align="center"
      gap="10px"
      wrap="nowrap"
      className={styles.pathContainer}
    >
      <StorageIcon />
      <Text className={clsx(styles.path, styles.ellipsis)}>{path}</Text>
    </Flex>
  );
});
