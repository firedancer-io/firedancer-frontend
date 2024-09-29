import { PropsWithChildren } from "react";
import { InView } from "react-intersection-observer";

interface CheckVisibilityCardProps {
  slot: number;
  lastCardSlot: number;
  setCardCount: (dir: "increase" | "decrease") => void;
}

export default function CheckVisibilityCard({
  slot,
  lastCardSlot,
  setCardCount,
  children,
}: PropsWithChildren<CheckVisibilityCardProps>) {
  if (slot !== lastCardSlot) {
    return children;
  }

  return (
    <>
      <InView
        onChange={(inView) => {
          if (!inView) {
            setCardCount("decrease");
          }
        }}
      >
        {children}
      </InView>
      <InView
        onChange={(inView) => {
          if (inView) {
            setCardCount("increase");
          }
        }}
      ></InView>
    </>
  );
}
