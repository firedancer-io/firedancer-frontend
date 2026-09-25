import type { Dispatch, SetStateAction } from "react";
import { Flex, Select, Switch, Text } from "@radix-ui/themes";
import {
  revenueScaleOptions,
  type RevenueScale,
  type RevenueViewOpts,
} from "./consts.ts";
import type { AggGranularity } from "../../../api/types.ts";
import styles from "./revenueControls.module.css";

interface RevenueControlsProps {
  isAgg: boolean;
  granularity: AggGranularity | undefined;
  opts: RevenueViewOpts;
  setOpts: Dispatch<SetStateAction<RevenueViewOpts>>;
}

export default function RevenueControls({
  isAgg,
  granularity,
  opts,
  setOpts,
}: RevenueControlsProps) {
  return (
    <Flex className={styles.controls} justify="end" align="center" gap="4">
      <Text>Bucket size: {isAgg ? (granularity ?? "-") : "Txn"}</Text>

      <Flex gap="1" align="center">
        <Text>Scale</Text>
        <Select.Root
          size="1"
          value={opts.scale}
          onValueChange={(value) =>
            setOpts((o) => ({ ...o, scale: value as RevenueScale }))
          }
        >
          <Select.Trigger className={styles.scaleTrigger} />
          <Select.Content>
            {revenueScaleOptions.map((option) => (
              <Select.Item key={option.value} value={option.value}>
                {option.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>

      {!isAgg && (
        <Text as="label">
          <Flex gap="1" align="center">
            <Switch
              size="1"
              checked={opts.splitByRow}
              onCheckedChange={(splitByRow) =>
                setOpts((o) => ({ ...o, splitByRow }))
              }
            />
            Split by tile
          </Flex>
        </Text>
      )}
    </Flex>
  );
}
