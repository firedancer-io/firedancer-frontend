import { Flex } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { liveSystemResourcesAtom } from "../../../api/atoms";
import type { SystemLive } from "../../../api/types";
import { SectionHeading } from "./Headings";
import { LegendSubHeading } from "./Legend";
import { getUsageSegments, plural, type ResourceSegment } from "./utils";

const diskCategoryColors: Record<string, string> = {
  accounts: "#118B74",
  shreds: "#B2904D",
  snapshots: "#4660B8",
  gui: "#9982F0",
  logs: "#E5484D",
};
const unknownDiskCategoryColor = "var(--gray-8)";

export default function DiskSection() {
  const mounts = useAtomValue(liveSystemResourcesAtom)?.disk;
  if (!mounts?.length) return null;

  return (
    <Flex direction="column" gap="10px" minWidth="0">
      <SectionHeading
        label="Disk"
        value={`${mounts.length} mount${plural(mounts.length)}`}
      />
      {mounts.map((mount) => (
        <LegendSubHeading
          key={mount.name}
          label={mount.name}
          segments={getDiskSegments(mount)}
          total={mount.total_bytes}
        />
      ))}
    </Flex>
  );
}

function getDiskSegments(mount: SystemLive["disk"][number]): ResourceSegment[] {
  let remainingUsed = mount.used_bytes;
  const firedancerSegments: ResourceSegment[] = [];
  for (const { path, category, bytes } of mount.files) {
    remainingUsed -= bytes;
    firedancerSegments.push({
      key: path,
      label: category,
      bytes,
      color: diskCategoryColors[category] ?? unknownDiskCategoryColor,
    });
  }

  return getUsageSegments(
    firedancerSegments,
    Math.max(0, remainingUsed),
    mount.total_bytes - mount.used_bytes,
  );
}
