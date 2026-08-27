import type { CSSProperties } from "react";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { useAtomValue } from "jotai";
import { peerStatsAtom } from "../../../atoms";
import ValidatorsStatsContent from "./ValidatorsStatsContent";

export default function ValidatorsCard({ className }: { className?: string }) {
  const peerStats = useAtomValue(peerStatsAtom);
  if (!peerStats) return null;

  return (
    <Card className={className}>
      <div
        className="rt-Flex rt-r-fd-column rt-r-gap-2 rt-r-h"
        style={{ "--height": "100%" } as CSSProperties}
      >
        <CardHeader text="Validators" />
        <ValidatorsStatsContent />
      </div>
    </Card>
  );
}
