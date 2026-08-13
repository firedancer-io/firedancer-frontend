import { Flex } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { liveSystemResourcesAtom, tilesAtom } from "../../../api/atoms";
import type { SystemLive } from "../../../api/types";
import NumaPanel from "./NumaPanel";
import DiskSection from "./DiskSection";
import { getNumaNodes } from "./utils";
import styles from "./resourcesCard.module.css";

// ============================================================================
// TEMPORARY — DELETE BEFORE MERGE
// Fabricates a second NUMA node by splitting the real single-node data in half
// so the multi-node layout can be iterated on during design. This is mock data
// only and must be removed once we're done with the example; delete the flag,
// the function, and restore the direct `getNumaNodes` call below.
// ============================================================================
const MOCK_TWO_NUMA_NODES = false;

function splitIntoTwoNodes(resources?: SystemLive): SystemLive | undefined {
  if (!resources) return resources;

  // Alternate physical cores between the two nodes so the split looks realistic,
  // keeping hyperthread siblings on the same node (they never straddle nodes).
  const nodeByCpu = new Map<number, number>();
  let coreCount = 0;
  resources.cpus.forEach((cpu, i) => {
    if (nodeByCpu.has(i)) return;
    const node = coreCount % 2;
    nodeByCpu.set(i, node);
    if (cpu.sibling_cpu != null) nodeByCpu.set(cpu.sibling_cpu, node);
    coreCount++;
  });

  const cpus = resources.cpus.map((cpu, i) => ({
    ...cpu,
    numa_node: nodeByCpu.get(i) ?? 0,
  }));
  const node0Tiles = new Set(
    cpus.flatMap((cpu) => (cpu.numa_node === 0 ? cpu.tile_idxs : [])),
  );

  const baseNode = resources.memory.nodes[0];
  const nodes = baseNode
    ? [0, 1].map((node) => ({
        ...baseNode,
        node,
        total_bytes: baseNode.total_bytes / 2,
        free_bytes: baseNode.free_bytes / 2,
        shared_bytes: baseNode.shared_bytes / 2,
        tiles: baseNode.tiles.filter((tile) =>
          node === 0
            ? node0Tiles.has(tile.tile_idx)
            : !node0Tiles.has(tile.tile_idx),
        ),
      }))
    : resources.memory.nodes;

  return { ...resources, cpus, memory: { ...resources.memory, nodes } };
}

export default function ResourcesCard() {
  const rawResources = useAtomValue(liveSystemResourcesAtom);
  const tiles = useAtomValue(tilesAtom);

  // TEMPORARY — DELETE BEFORE MERGE: mock two-NUMA-node data for the design
  // example, gated behind MOCK_TWO_NUMA_NODES (false by default).
  const resources = MOCK_TWO_NUMA_NODES
    ? splitIntoTwoNodes(rawResources)
    : rawResources;
  const displayNodes = getNumaNodes(resources?.cpus, resources?.memory);

  return (
    <Card>
      <Flex direction="column" gap="3">
        <CardHeader text="Resources" />
        <DiskSection mounts={resources?.disk} />
        {displayNodes.length === 0 ? (
          <div className={styles.numaGrid}>
            <div className={styles.numaPanelPlaceholder} />
          </div>
        ) : (
          <div className={styles.numaGrid}>
            {displayNodes.map((node, i) => (
              <NumaPanel
                key={i}
                node={node}
                cpus={resources?.cpus ?? []}
                tiles={tiles}
              />
            ))}
          </div>
        )}
      </Flex>
    </Card>
  );
}
