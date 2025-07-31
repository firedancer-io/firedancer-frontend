import { Flex, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { PropsWithChildren, useMemo, useReducer } from "react";
import { slotsPerLeader } from "../../../consts";
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
import PreloadCardList from "./PreloadCardList";
import { getSlotCards } from "./slotCards";
import {
  primaryTextColor,
  slotCardSectionBackgroundColor,
  slotCardSectionColor,
} from "../../../colors";

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

export default function SlotCardList() {
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const slotOverride = useAtomValue(slotOverrideAtom);
  const searchLeaderSlots = useAtomValue(searchLeaderSlotsAtom);
  const epoch = useAtomValue(epochAtom);

  const [cardCount, setCardCount] = useReducer(
    cardCountReducer,
    initSlotCardCount,
  );

  const topSlot =
    slotOverride ??
    (currentLeaderSlot ?? 0) + initUpcomingSlotCardCount * slotsPerLeader;

  const { upcoming, now, past } = useMemo(
    () =>
      getSlotCards({
        cardCount,
        currentLeaderSlot,
        epoch,
        searchLeaderSlots,
        slotOverride,
        topSlot,
      }),
    [
      cardCount,
      currentLeaderSlot,
      epoch,
      searchLeaderSlots,
      slotOverride,
      topSlot,
    ],
  );

  if (currentLeaderSlot === undefined) return;

  if (searchLeaderSlots?.length === 0) {
    return (
      <Flex
        justify="center"
        align="center"
        style={{
          color: primaryTextColor,
          fontSize: "24px",
          letterSpacing: "-0.96px",
          minHeight: "300px",
        }}
      >
        <Text>No slots found.</Text>
      </Flex>
    );
  }

  const topCardSlotLeader = upcoming[0] ?? now[0] ?? past[0] ?? -1;

  const bottomCardSlotLeader =
    past[past.length - 1] ??
    now[now.length - 1] ??
    upcoming[upcoming.length - 1] ??
    -1;

  return (
    <>
      {!!upcoming.length && (
        <SlotCardSection sectionName="Upcoming">
          {upcoming.map((slot) => {
            return (
              <CheckVisibilityCard
                key={slot}
                slot={slot}
                lastCardSlot={bottomCardSlotLeader}
                setCardCount={setCardCount}
              >
                <UpcomingSlotCard slot={slot} key={slot} />
              </CheckVisibilityCard>
            );
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
                lastCardSlot={bottomCardSlotLeader}
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
                lastCardSlot={bottomCardSlotLeader}
                setCardCount={setCardCount}
              >
                <PastSlotCard slot={slot} />
              </CheckVisibilityCard>
            );
          })}
        </SlotCardSection>
      )}
      <PreloadCardList
        topCardSlotLeader={topCardSlotLeader}
        bottomCardSlotLeader={bottomCardSlotLeader}
      />
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
              background: slotCardSectionBackgroundColor,
              height: "10px",
            }}
          />
          <Text
            style={{
              transform: "rotate(180deg)",
              writingMode: "vertical-rl",
              color: slotCardSectionColor,
            }}
            size="2"
          >
            {sectionName}
          </Text>
          <div
            style={{
              width: "1px",
              flex: 1,
              background: slotCardSectionBackgroundColor,
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
