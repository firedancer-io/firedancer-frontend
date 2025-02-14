import { Flex, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { PropsWithChildren, useMemo, useReducer } from "react";
import { slotsPerLeader } from "../../../consts";
import { SlotType } from "./types";
import UpcomingSlotCard from "./UpcomingSlotCard";
import { PastSlotCard } from "./PastSlotCard";
import CurrentSlotCard from "./CurrentSlotCard";
import CheckVisibilityCard from "./CheckVisibility";
import {
  currentLeaderSlotAtom,
  epochAtom,
  slotOverrideAtom,
} from "../../../atoms";
import { searchLeaderSlotsAtom } from "../atoms";
import { useMedia } from "react-use";

export const initUpcomingSlotCardCount = 3;
const initSlotCardCount = 10;
const increaseSlotCardCount = 2;
const decreaseSlotCardCount = 1;

function cardCountReducer(prev: number, action: "increase" | "decrease") {
  switch (action) {
    case "increase":
      return prev + increaseSlotCardCount;
    case "decrease":
      return Math.max(1, prev - decreaseSlotCardCount);
  }
}

function getSlotType(slot: number, currentLeaderSlot: number) {
  if (slot < currentLeaderSlot) return SlotType.Past;
  if (slot > currentLeaderSlot) return SlotType.Upcoming;
  return SlotType.Now;
}

export default function SlotCardList() {
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const slotOverride = useAtomValue(slotOverrideAtom);
  const searchLeaderSlots = useAtomValue(searchLeaderSlotsAtom);
  const epoch = useAtomValue(epochAtom);

  const [cardCount, setCardCount] = useReducer(
    cardCountReducer,
    initSlotCardCount
  );

  const topSlot =
    slotOverride ??
    (currentLeaderSlot ?? 0) + initUpcomingSlotCardCount * slotsPerLeader;

  const { upcoming, now, past } = useMemo(() => {
    const upcoming: number[] = [];
    const now: number[] = [];
    const past: number[] = [];

    if (currentLeaderSlot === undefined) return { upcoming, now, past };

    for (let i = 0; i < cardCount; i++) {
      let slot = 0;

      if (searchLeaderSlots?.length) {
        const descSlots = [...searchLeaderSlots].reverse();

        if (slotOverride === undefined) {
          if (descSlots.length <= cardCount) {
            slot = descSlots[i];
          } else {
            const firstPastSlotIndex = descSlots.findIndex(
              (slot) => slot < currentLeaderSlot
            );
            const initPastSlotGroups = 3;
            const indexOffset = Math.max(
              firstPastSlotIndex - initPastSlotGroups,
              0
            );
            slot = descSlots[i + indexOffset];
          }
        } else {
          const slotDiffs = descSlots.map((slot) =>
            Math.abs(slot - slotOverride)
          );
          const minDiff = Math.min(...slotDiffs);
          const indexOffset = Math.max(slotDiffs.indexOf(minDiff) - 3, 0);
          slot = descSlots[i + indexOffset];
        }

        if (!slot) break;
      } else {
        slot = topSlot - i * slotsPerLeader;
      }

      if (epoch && (slot < epoch.start_slot || slot > epoch.end_slot)) {
        continue;
      }

      const slotType = getSlotType(slot, currentLeaderSlot);

      if (slotType === SlotType.Upcoming) {
        upcoming.push(slot);
      }

      if (slotType === SlotType.Now) {
        now.push(slot);
      }

      if (slotType === SlotType.Past) {
        past.push(slot);
      }
    }

    return { upcoming, now, past };
  }, [
    cardCount,
    currentLeaderSlot,
    epoch,
    searchLeaderSlots,
    slotOverride,
    topSlot,
  ]);

  if (currentLeaderSlot === undefined) return;

  if (searchLeaderSlots?.length === 0) {
    return (
      <Flex
        justify="center"
        align="center"
        style={{
          color: "#B2BCC9",
          fontSize: "24px",
          letterSpacing: "-0.96px",
          minHeight: "300px",
        }}
      >
        <Text>No slots found.</Text>
      </Flex>
    );
  }

  const lastCardSlot =
    past[past.length - 1] ??
    now[now.length - 1] ??
    upcoming[upcoming.length - 1];

  return (
    <>
      {!!upcoming.length && (
        <SlotCardSection sectionName="Upcoming">
          {upcoming.map((slot) => {
            return (
              <CheckVisibilityCard
                key={slot}
                slot={slot}
                lastCardSlot={lastCardSlot}
                setCardCount={setCardCount}
              >
                <UpcomingSlotCard slot={slot} key={slot} />
              </CheckVisibilityCard>
            );
            // }
          })}
        </SlotCardSection>
      )}

      {!!now.length && (
        <SlotCardSection sectionName="Now">
          {now.map((slot) => {
            return (
              <CheckVisibilityCard
                key={slot}
                slot={slot}
                lastCardSlot={lastCardSlot}
                setCardCount={setCardCount}
              >
                <CurrentSlotCard slot={slot} key={slot} />
              </CheckVisibilityCard>
            );
            // }
          })}
        </SlotCardSection>
      )}

      {!!past.length && (
        <SlotCardSection sectionName="Past">
          {past.map((slot) => {
            return (
              <CheckVisibilityCard
                key={slot}
                slot={slot}
                lastCardSlot={lastCardSlot}
                setCardCount={setCardCount}
              >
                <PastSlotCard slot={slot} />
              </CheckVisibilityCard>
            );
          })}
        </SlotCardSection>
      )}
    </>
  );
}

function SlotCardSection({
  children,
  sectionName,
}: PropsWithChildren<{ sectionName: string }>) {
  const isWideScreen = useMedia("(min-width: 700px)");

  return (
    <Flex gap="2" align="stretch">
      {isWideScreen && (
        <Flex direction="column" gap="2" align="center">
          <div
            style={{
              width: "1px",
              flex: 1,
              background: "#676767",
              height: "10px",
            }}
          />
          <Text
            style={{
              transform: "rotate(180deg)",
              writingMode: "vertical-rl",
              color: "#8A8A8A",
            }}
            size="2"
          >
            {sectionName}
          </Text>
          <div
            style={{
              width: "1px",
              flex: 1,
              background: "#676767",
              height: "10px",
            }}
          />
        </Flex>
      )}
      <Flex direction="column" flexGrow="1" gap="2" minWidth="0">
        {children}
      </Flex>
    </Flex>
  );
}
