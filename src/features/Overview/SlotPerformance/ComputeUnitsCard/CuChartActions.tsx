import { Button, Flex, IconButton, Separator } from "@radix-ui/themes";
import { ZoomInIcon, ZoomOutIcon, ResetIcon } from "@radix-ui/react-icons";
import styles from "./cuChartActions.module.css";
import { banksXScaleKey } from "./consts";
import { useAtomValue } from "jotai";
import { isFullXRangeAtom } from "./atoms";

interface CuChartActionsProps {
  onUplot: (func: (u: uPlot) => void) => void;
}

export default function CuChartActions({ onUplot }: CuChartActionsProps) {
  const isFullXRange = useAtomValue(isFullXRangeAtom);

  return (
    <Flex gap="3" align="center">
      <Separator orientation="vertical" size="2" />
      <Flex gap="1px">
        <IconButton
          variant="soft"
          onClick={() =>
            onUplot((u) => {
              const min = u.scales[banksXScaleKey].min ?? 0;
              const max = u.scales[banksXScaleKey].max ?? 0;
              const range = max - min;
              if (range <= 0) return;

              const zoomDiff = range * 0.2;

              u.setScale(banksXScaleKey, {
                min: min + zoomDiff,
                max: max - zoomDiff,
              });
            })
          }
          className={styles.button}
        >
          <ZoomInIcon width="18" height="18" />
        </IconButton>
        <IconButton
          variant="soft"
          onClick={() =>
            onUplot((u) => {
              const scaleMin = u.data[0][0];
              const scaleMax = u.data[0].at(-1) ?? scaleMin;
              const min = u.scales[banksXScaleKey].min ?? 0;
              const max = u.scales[banksXScaleKey].max ?? 0;
              const range = max - min;
              if (range <= 0) return;

              const zoomDiff = range * 0.2;

              u.setScale(banksXScaleKey, {
                min: Math.max(min - zoomDiff, scaleMin),
                max: Math.min(max + zoomDiff, scaleMax),
              });
            })
          }
          disabled={isFullXRange}
          className={styles.button}
        >
          <ZoomOutIcon width="18" height="18" />
        </IconButton>
        <Button
          variant="soft"
          onClick={() =>
            onUplot((u) =>
              u.setScale(banksXScaleKey, {
                min: u.data[0][0],
                max: u.data[0].at(-1) ?? 0,
              }),
            )
          }
          disabled={isFullXRange}
          className={styles.button}
        >
          <ResetIcon width="18" height="18" />
        </Button>
      </Flex>
    </Flex>
  );
}
