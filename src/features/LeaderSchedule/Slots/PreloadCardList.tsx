import { useAtomValue } from "jotai";
import { slotsPerLeader } from "../../../consts";
import { searchLeaderSlotsAtom } from "../atoms";
import PreloadCard from "./PreloadCard";

interface PreloadCardListProps {
  topCardSlotLeader: number;
  bottomCardSlotLeader: number;
}

const preloadCardCount = slotsPerLeader * 5;

function getPreloadSlots({
  topCardSlotLeader,
  bottomCardSlotLeader,
  searchLeaderSlots,
}: {
  topCardSlotLeader: number;
  bottomCardSlotLeader: number;
  searchLeaderSlots: number[] | undefined;
}) {
  if (searchLeaderSlots) {
    const preloadCardSlots = [];
    const startIx = searchLeaderSlots.indexOf(bottomCardSlotLeader);
    const endIx = searchLeaderSlots.indexOf(topCardSlotLeader);

    if (startIx > 0) {
      for (let i = 1; i <= preloadCardCount; i++) {
        const slotIx = searchLeaderSlots[startIx - i];
        for (let j = 0; j < slotsPerLeader; j++) {
          preloadCardSlots.push(slotIx + j);
        }
      }
    }

    if (endIx > 0) {
      for (let i = 1; i <= preloadCardCount; i++) {
        const slotIx = searchLeaderSlots[endIx + i];
        for (let j = 0; j < slotsPerLeader; j++) {
          preloadCardSlots.push(slotIx + j);
        }
      }
    }

    return preloadCardSlots;
  } else {
    const firstSlotBounds = bottomCardSlotLeader - 1;
    const lastSlotBounds = topCardSlotLeader + slotsPerLeader;
    const preloadCardSlots = [];

    if (firstSlotBounds > 0) {
      for (
        let i = firstSlotBounds;
        i > firstSlotBounds - preloadCardCount;
        i--
      ) {
        preloadCardSlots.push(i);
      }
    }

    if (lastSlotBounds > 0) {
      for (let i = lastSlotBounds; i < lastSlotBounds + preloadCardCount; i++) {
        preloadCardSlots.push(i);
      }
    }

    return preloadCardSlots;
  }
}

export default function PreloadCardList({
  topCardSlotLeader,
  bottomCardSlotLeader,
}: PreloadCardListProps) {
  const searchLeaderSlots = useAtomValue(searchLeaderSlotsAtom);

  const preloadCardSlots = getPreloadSlots({
    topCardSlotLeader,
    bottomCardSlotLeader,
    searchLeaderSlots,
  });

  return (
    <>
      {preloadCardSlots.map((slot) => (
        <PreloadCard slot={slot} key={slot} />
      ))}
    </>
  );
}
