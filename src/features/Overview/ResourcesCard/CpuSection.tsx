import { Flex, Text, Tooltip } from "@radix-ui/themes";
import clsx from "clsx";
import type { SystemLive, Tile } from "../../../api/types";
import { getCpuGroups, getCpuSummary } from "./utils";
import { SectionHeading } from "./MemorySection";
import styles from "./resourcesCard.module.css";

export default function CpuSection({
  cpus,
  tiles,
}: {
  cpus?: SystemLive["cpus"];
  tiles?: Tile[];
}) {
  if (!cpus) {
    return (
      <Flex direction="column" gap="2">
        <SectionHeading label="CPU" value="—" />
        <div className={styles.cpuGridPlaceholder} />
      </Flex>
    );
  }

  const summary = getCpuSummary(cpus);
  const groups = getCpuGroups(cpus);

  return (
    <Flex direction="column" gap="2" minWidth="0">
      <SectionHeading
        label="CPU"
        value={`${summary.pinned} / ${summary.total} pinned`}
      />
      <div
        className={styles.cpuGrid}
        aria-label={`${summary.pinned} of ${summary.total} logical CPUs pinned`}
      >
        {groups.map((group) => {
          const descriptions = group.map((cpuIdx) => {
            const cpu = cpus[cpuIdx];
            const tileLabels = cpu.tile_idxs.map((tileIdx) => {
              const tile = tiles?.[tileIdx];
              return tile
                ? `${tile.kind} ${tile.kind_id} (${tileIdx})`
                : `${tileIdx}`;
            });
            const status = getCpuStatus(cpu);
            return {
              cpuIdx,
              cpu,
              status,
              tileLabels,
            };
          });

          return (
            <Tooltip
              key={group.join("-")}
              content={
                <Flex direction="column" gap="2">
                  {descriptions.map(({ cpuIdx, cpu, status, tileLabels }) => (
                    <Flex key={cpuIdx} direction="column" gap="1">
                      <Text weight="bold">Logical CPU {cpuIdx}</Text>
                      <Text>
                        {status} · NUMA {cpu.numa_node}
                      </Text>
                      {tileLabels.length > 0 && (
                        <Text>Tiles: {tileLabels.join(", ")}</Text>
                      )}
                    </Flex>
                  ))}
                </Flex>
              }
            >
              <div
                className={styles.cpu}
                aria-label={descriptions
                  .map(({ cpuIdx, status }) => `CPU ${cpuIdx}: ${status}`)
                  .join(", ")}
              >
                {descriptions.map(({ cpuIdx, cpu }) => (
                  <div
                    key={cpuIdx}
                    className={clsx(styles.cpuHalf, {
                      [styles.cpuPinned]:
                        cpu.online && cpu.tile_idxs.length > 0,
                      [styles.cpuOffline]: !cpu.online,
                    })}
                  />
                ))}
                {descriptions.length === 1 && (
                  <div className={styles.cpuHalf} />
                )}
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Flex>
  );
}

function getCpuStatus(cpu: SystemLive["cpus"][number]) {
  if (!cpu.online) return "Offline";
  return cpu.tile_idxs.length > 0 ? "Pinned" : "Unpinned";
}
