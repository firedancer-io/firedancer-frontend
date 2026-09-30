import { useAtomValue } from "jotai";
import Card from "../../../components/Card";
import { showStartupProgressAtom } from "../../StartupProgress/atoms";
import SlotLanes from "./SlotLanes";

interface SlotTimelineProps {
  className: string;
}
export default function SlotTimeline({ className }: SlotTimelineProps) {
  const isStartupRunning = useAtomValue(showStartupProgressAtom);
  if (isStartupRunning) return;

  return (
    <Card className={className}>
      <SlotLanes />
    </Card>
  );
}
