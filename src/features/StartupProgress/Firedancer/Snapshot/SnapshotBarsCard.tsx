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
import type { FormattedBytes } from "../../../../utils";

const gap = "4px";

interface SnapshotBarsCardProps {
  title: string;
  headerContent: JSX.Element;
  footer?: JSX.Element;
  throughput: number | null | undefined;
  maxThroughput: number;
}
export function SnapshotBarsCard({
  title,
  headerContent,
  footer,
  throughput,
  maxThroughput,
}: SnapshotBarsCardProps) {
  return (
    <Card className={clsx(styles.card, styles.barsCard)}>
      <Flex
        justify="between"
        wrap="nowrap"
        gap={gap}
        className={styles.cardHeader}
      >
        <SnapshotTitle text={title} />
        <Flex gap={gap} minWidth="0" className={styles.headerRightSection}>
          {headerContent}
        </Flex>
      </Flex>

      <Bars value={throughput ?? 0} max={maxThroughput} />

      {footer}
    </Card>
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
  cumulativeAccounts?: number | null;
}
export function AccountsRate({ cumulativeAccounts }: AccountsRateProps) {
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
    // Possible to have no rate due to only having a single point
    if (cumulativeAccounts != null && accountsPerSecond == null) return "0";
    if (accountsPerSecond == null) return;
    return compactSingleDecimalFormatter.format(accountsPerSecond);
  }, [accountsPerSecond, cumulativeAccounts]);

  return (
    <div className={styles.rightColumn}>
      <ValueUnitText value={value} unit="Accounts / sec" />
    </div>
  );
}

interface SnapshotTotalCompleteProps {
  completed: FormattedBytes | undefined;
  total: FormattedBytes | undefined;
}
export function SnapshotTotalComplete({
  completed,
  total,
}: SnapshotTotalCompleteProps) {
  return (
    <Flex className={styles.centerColumn}>
      <ValueUnitText value={completed?.value} unit={completed?.unit} />

      <Text> / </Text>

      <ValueUnitText value={total?.value} unit={total?.unit} />
    </Flex>
  );
}

interface SnapshotThroughputProps {
  prefix?: string;
  throughput: FormattedBytes | undefined;
}
export function SnapshotThroughput({
  prefix,
  throughput,
}: SnapshotThroughputProps) {
  return (
    <div className={styles.rightColumn}>
      {prefix && <Text className={styles.secondaryColor}>{prefix} </Text>}
      <ValueUnitText value={throughput?.value} unit={throughput?.unit} />
      <Text className={styles.secondaryColor}>/sec</Text>
    </div>
  );
}

interface SnapshotPathProps {
  path?: string | null;
}
export const MSnapshotPath = memo(function SnapshotPath({
  path,
}: SnapshotPathProps) {
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
