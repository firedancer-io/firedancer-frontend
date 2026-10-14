import type { Dispatch, SetStateAction } from "react";
import { Flex, Switch, Text } from "@radix-ui/themes";
import type { ExecrpViewOpts } from "./consts.ts";
import styles from "./execrpControls.module.css";

interface ExecrpControlsProps {
  opts: ExecrpViewOpts;
  setOpts: Dispatch<SetStateAction<ExecrpViewOpts>>;
  showGranularity: boolean;
}

export default function ExecrpControls({
  opts,
  setOpts,
  showGranularity,
}: ExecrpControlsProps) {
  return (
    <Flex className={styles.controls} justify="end" align="center" gap="4">
      {showGranularity && (
        <Text as="label">
          <Flex gap="1" align="center">
            <Switch
              size="1"
              checked={opts.granularity === "txn_batch"}
              onCheckedChange={(batch) =>
                setOpts((o) => ({
                  ...o,
                  granularity: batch ? "txn_batch" : "txn",
                }))
              }
            />
            Batch
          </Flex>
        </Text>
      )}

      <Text as="label">
        <Flex gap="1" align="center">
          <Switch
            size="1"
            checked={opts.showOutlines}
            onCheckedChange={(showOutlines) =>
              setOpts((o) => ({ ...o, showOutlines }))
            }
          />
          Error state
        </Flex>
      </Text>
    </Flex>
  );
}
