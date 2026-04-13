import { Flex, Text } from "@radix-ui/themes";
import styles from "./supermajority.module.css";
import { useAtomValue } from "jotai";
import { bootProgressAtom } from "../../../../api/atoms";
import { formatFrequency } from "../../../../numUtils";
import CopyButton from "../../../../components/CopyButton";
import { snapshotSlotAtom } from "../../atoms";

export default function SupermajorityDetailsBox() {
  const bootProgress = useAtomValue(bootProgressAtom);
  const slot = useAtomValue(snapshotSlotAtom);

  if (!bootProgress) return null;

  const attempt = bootProgress.wait_for_supermajority_attempt;
  const snapshotSource =
    bootProgress.loading_incremental_snapshot_read_path ??
    bootProgress.loading_full_snapshot_read_path;

  return (
    <Flex
      flexShrink="0"
      direction="column"
      width="100%"
      className={styles.detailsBox}
      gapY="10px"
    >
      <Flex gapX="8px" justify="between">
        <LabelValue label="Slot" value={slot?.toString()} />
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
    </Flex>
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
    <Flex direction="column" gap="3px">
      <Text className={styles.label}>{label}</Text>
      <CopyButton
        className={styles.copyButton}
        value={allowCopy && value ? value : undefined}
        color="white"
        size="12px"
        hideIconUntilHover
      >
        <Text className={valueClassName} truncate={!wrap}>
          {value ?? "--"}
        </Text>
      </CopyButton>
    </Flex>
  );
}
