import { Card, Flex, Text } from "@radix-ui/themes";
import styles from "./snapshot.module.css";
import byteSize from "byte-size";
import clsx from "clsx";
import { Bars } from "../Bars";
import { useValuePerSecond } from "../useValuePerSecond";
import { bootProgressPhaseAtom } from "../../atoms";
import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import StorageIcon from "@material-design-icons/svg/filled/storage.svg?react";
import { compactSingleDecimalFormatter } from "../../../../numUtils";

const MAX_THROUGHPUT_BYTES_PER_S = 300_000_000;

interface SnapshotLoadingCardProps {
  title: string;
  completed?: number | null;
  total?: number | null;
  showAccountRate?: boolean;
  cumulativeAccounts?: number | null;
  footerText?: string | null;
}
export function SnapshotLoadingCard({
  title,
  completed,
  total,
  showAccountRate = false,
  cumulativeAccounts,
  footerText,
}: SnapshotLoadingCardProps) {
  const phase = useAtomValue(bootProgressPhaseAtom);
  const { valuePerSecond: throughput, reset } = useValuePerSecond(
    completed,
    1_000,
  );

  useEffect(() => {
    // reset throughput history on phase change
    reset();
  }, [phase, reset]);

  const throughputObj = throughput == null ? undefined : byteSize(throughput);
  const completedObj = completed == null ? undefined : byteSize(completed);
  const totalObj = total == null ? undefined : byteSize(total);

  return (
    <Card className={clsx(styles.card, styles.throughputCard)}>
      <Flex
        justify="between"
        align="center"
        wrap="wrap"
        gapX="4"
        className={styles.cardHeader}
      >
        <Text className={clsx(styles.title, styles.ellipsis)}>{title}</Text>

        {showAccountRate && (
          <AccountsRate cumulativeAccounts={cumulativeAccounts} />
        )}

        <div className={styles.total}>
          <ValueUnitText
            value={completedObj?.value}
            unit={completedObj?.unit}
          />

          <Text> / </Text>

          <ValueUnitText value={totalObj?.value} unit={totalObj?.unit} />
        </div>

        <div className={styles.throughput}>
          <ValueUnitText
            value={throughputObj?.value}
            unit={throughputObj?.unit}
          />
          <Text className={styles.secondaryColor}>/sec</Text>
        </div>
      </Flex>

      <Bars value={throughput ?? 0} max={MAX_THROUGHPUT_BYTES_PER_S} />

      {footerText && (
        <Flex align="center" gap="10px" wrap="nowrap" className={styles.footer}>
          <StorageIcon />
          <Text className={clsx(styles.footerText, styles.ellipsis)}>
            {footerText}
          </Text>
        </Flex>
      )}
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

interface AccountsRateProps {
  cumulativeAccounts?: number | null;
}
function AccountsRate({ cumulativeAccounts }: AccountsRateProps) {
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
    if (accountsPerSecond == null) return;
    return compactSingleDecimalFormatter.format(accountsPerSecond);
  }, [accountsPerSecond]);

  return (
    <div className={styles.accountsRate}>
      <ValueUnitText value={value} unit="Accounts / sec" />
    </div>
  );
}
