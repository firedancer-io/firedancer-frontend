import { useAtomValue } from "jotai";
import type { CSSProperties } from "react";
import Card from "../../../components/Card";
import { headerGap } from "../../Gossip/consts";
import { isStartupPhaseAtom } from "../../StartupProgress/atoms";
import SlotLanes from "./SlotLanes";

export default function SlotTimeline() {
  // keys off the phase so the reveal lands in the same commit as the
  // flush that populates the bars (the showStartupProgress mirror is set
  // in an effect, one commit later)
  const isStartup = useAtomValue(isStartupPhaseAtom);

  return (
    // Stays in flow (hidden) during startup so the cards grid below
    // renders at its final position from the first paint
    <Card style={isStartup ? { visibility: "hidden" } : undefined}>
      <div
        className="rt-Flex rt-r-fd-column rt-r-gap rt-r-h"
        style={{ "--gap": headerGap, "--height": "100%" } as CSSProperties}
      >
        <span
          className="rt-Text"
          style={{
            color: "var(--primary-text-color)",
            fontSize: "18px",
          }}
        >
          Slots
        </span>
        <SlotLanes />
      </div>
    </Card>
  );
}
