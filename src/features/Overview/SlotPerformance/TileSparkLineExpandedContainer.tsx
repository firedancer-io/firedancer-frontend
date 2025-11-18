import { Button, Flex, Popover } from "@radix-ui/themes";
import type { PropsWithChildren, ReactNode } from "react";
import styles from "./tileSparkLineExpandedContainer.module.css";
import TileSparkLine from "./TileSparkLine";
import TileBusy from "./TileBusy";
import { mean } from "lodash";
import { isDefined } from "../../../utils";

let recentlyOnOpen = false;

interface TileSparkLineExpandedContainerProps {
  tileCountArr: unknown[];
  liveBusyPerTile?: number[];
  queryIdlePerTile?: number[][];
  width: number;
  header: ReactNode;
  isExpanded: boolean;
  setIsExpanded: (isExpanded: boolean) => void;
}

export default function TileSparkLineExpandedContainer({
  children,
  tileCountArr,
  liveBusyPerTile,
  queryIdlePerTile,
  width,
  header,
  isExpanded,
  setIsExpanded,
}: PropsWithChildren<TileSparkLineExpandedContainerProps>) {
  const canExpand = tileCountArr.length > 1;
  if (!canExpand) return <Flex gap="1">{children}</Flex>;

  return (
    <Popover.Root
      open={isExpanded}
      onOpenChange={(open) => {
        if (recentlyOnOpen) return;

        setIsExpanded(open);
        recentlyOnOpen = true;
        setTimeout(() => (recentlyOnOpen = false), 10);
      }}
      defaultOpen={false}
    >
      <Popover.Trigger>
        {!isExpanded ? (
          <Button className={styles.btn}>{children}</Button>
        ) : (
          <div></div>
        )}
      </Popover.Trigger>
      <Popover.Content
        width={`${width}px`}
        size="1"
        side="top"
        sideOffset={-17}
        align="center"
      >
        <Flex gap="3" direction="column">
          {header}
          {liveBusyPerTile
            ? liveBusyPerTile.map((busy, i) => (
                <Flex key={i}>
                  <TileSparkLine value={busy} />
                  <TileBusy busy={busy} />
                </Flex>
              ))
            : tileCountArr?.map((_, i) => {
                const queryBusy = queryIdlePerTile
                  ?.map((idlePerTile) =>
                    idlePerTile[i] !== undefined && idlePerTile[i] !== -1
                      ? 1 - idlePerTile[i]
                      : undefined,
                  )
                  .filter(isDefined);

                if (!queryBusy?.length) return;

                return (
                  <Flex key={i}>
                    <TileSparkLine queryBusy={queryBusy} />
                    <TileBusy busy={mean(queryBusy)} />
                  </Flex>
                );
              })}
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
}
