import { Card, Flex, Text } from "@radix-ui/themes";
import styles from "./supermajority.module.css";
import clsx from "clsx";
import { useAtomValue } from "jotai";
import { bootProgressAtom } from "../../../../api/atoms";
import { formatFrequency } from "../../../../numUtils";
import CopyButton from "../../../../components/CopyButton";
import { snapshotSlotAtom } from "../../atoms";

export default function SupermajorityDetailsCard() {
  const bootProgress = useAtomValue(bootProgressAtom);
  const slot = useAtomValue(snapshotSlotAtom);

  if (!bootProgress) return null;

  const attempt = bootProgress.wait_for_supermajority_attempt;
  const snapshotSource =
    bootProgress.loading_incremental_snapshot_read_path ??
    bootProgress.loading_full_snapshot_read_path;

  return (
    <Card className={clsx(styles.card, styles.detailsCard)}>
      <Flex align="center" justify="between">
        <LabelValue
          label="Slot"
          value={slot == null ? undefined : slot.toString()}
        />
        <LabelValue
          label="Shred Version"
          value={bootProgress.wait_for_supermajority_shred_version}
        />
        <LabelValue
          label="Forked"
          value={attempt == null ? undefined : formatFrequency(attempt)}
        />
      </Flex>
      <LabelValue
        label="Bank Hash"
        value={bootProgress.wait_for_supermajority_bank_hash}
        allowCopy
      />
      <LabelValue
        label="Snapshot Source"
        value={snapshotSource}
        wrap
        valueClassName={styles.snapshotSource}
        allowCopy
      />
    </Card>
  );
}

interface LabelValueProps {
  label: string;
  value: string | null | undefined;
  valueClassName?: string;
  wrap?: boolean;
  allowCopy?: boolean;
}
function LabelValue({
  label,
  value,
  wrap = false,
  valueClassName,
  allowCopy = false,
}: LabelValueProps) {
  return (
    <Flex direction="column">
      <Text className={styles.label}>{label}</Text>
      {allowCopy && value ? (
        <CopyButton
          className={styles.copyButton}
          value={value}
          color="white"
          size="12px"
          hideIconUntilHover
        >
          <Text className={valueClassName} truncate={!wrap}>
            {value}
          </Text>
        </CopyButton>
      ) : (
        <Text className={valueClassName} truncate={!wrap}>
          {value ?? "--"}
        </Text>
      )}
    </Flex>
  );
}
