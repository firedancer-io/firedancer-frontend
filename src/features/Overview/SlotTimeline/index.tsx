import { useAtomValue } from "jotai";
import Card from "../../../components/Card";
import { isStartupProgressVisibleAtom } from "../../StartupProgress/atoms";
import SlotLanes from "./SlotLanes";

interface SlotTimelineProps {
  className: string;
}
export default function SlotTimeline({ className }: SlotTimelineProps) {
  const isStartupVisible = useAtomValue(isStartupProgressVisibleAtom);
  if (isStartupVisible) return;

  return (
    <Card className={className}>
      <SlotLanes />
    </Card>
  );
}
