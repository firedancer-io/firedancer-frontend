import { Card, Flex, Text } from "@radix-ui/themes";
import styles from "./snapshot.module.css";
import clsx from "clsx";
import { Bars } from "../Bars";
import { useValuePerSecond } from "../useValuePerSecond";
import { bootProgressPhaseAtom } from "../../atoms";
import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import StorageIcon from "@material-design-icons/svg/filled/storage.svg?react";
import { compactSingleDecimalFormatter } from "../../../../numUtils";
import type { FormattedBytes } from "../../../../utils";

const MAX_THROUGHPUT_BYTES_PER_S = 300_000_000;

interface SnapshotBarsCardProps {
  headerContent: JSX.Element;
  footer?: JSX.Element;
  throughput: number | null | undefined;
  containerClassName: string;
}
export function SnapshotBarsCard({
  headerContent,
  footer,
  throughput,
  containerClassName,
}: SnapshotBarsCardProps) {
  return (
    <Card className={clsx(styles.card, styles.barsCard, containerClassName)}>
      <Flex
        justify="between"
        align="center"
        wrap="wrap"
        gapX="4"
        className={styles.cardHeader}
      >
        {headerContent}
      </Flex>

      <Bars value={throughput ?? 0} max={MAX_THROUGHPUT_BYTES_PER_S} />

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
      {unit && (
        <>
          {" "}
          <Text className={styles.secondaryColor}>{unit}</Text>
        </>
      )}
    </>
  );
}

interface SnapshotTitleProps {
  text: string;
}
export function SnapshotTitle({ text }: SnapshotTitleProps) {
  return <Text className={clsx(styles.title, styles.ellipsis)}>{text}</Text>;
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
    <div className={styles.accountsRate}>
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
    <div className={styles.total}>
      <ValueUnitText value={completed?.value} unit={completed?.unit} />

      <Text> / </Text>

      <ValueUnitText value={total?.value} unit={total?.unit} />
    </div>
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
    <div className={clsx(styles.throughput, { [styles.withPrefix]: !!prefix })}>
      {prefix && <Text className={styles.secondaryColor}>{prefix} </Text>}
      <ValueUnitText value={throughput?.value} unit={throughput?.unit} />
      <Text className={styles.secondaryColor}>/sec</Text>
    </div>
  );
}

interface SnapshotReadPathProps {
  readPath?: string | null;
}
export function SnapshotReadPath({ readPath }: SnapshotReadPathProps) {
  return (
    <Flex
      align="center"
      gap="10px"
      wrap="nowrap"
      className={styles.readPathContainer}
    >
      <StorageIcon />
      <Text className={clsx(styles.readPath, styles.ellipsis)}>{readPath}</Text>
    </Flex>
  );
}
