import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import styles from "./animatedInteger.module.css";
import clsx from "clsx";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useUnmount } from "react-use";

const stepSize = 1;
type Direction = "incr" | "decr";

type AnimationLeg = {
  start: number;
  target: number;
  maxDigitsSeen: number;
};
function animationLegReducer(
  prev: AnimationLeg,
  values: { start: number; target: number },
) {
  const { start, target } = values;
  return {
    start,
    target,
    // Keep track of the longest number of digits we've seen
    maxDigitsSeen: Math.max(
      prev.maxDigitsSeen,
      getNumDigits(start),
      getNumDigits(target),
    ),
  };
}

interface AnimatedIntegerProps {
  value: number;
  animationDurationMs: number;
  height: number;
  textClassName?: string;
}
export default function AnimatedInteger({
  value,
  animationDurationMs,
  height,
  textClassName,
}: AnimatedIntegerProps) {
  const [leg, setLeg] = useReducer(animationLegReducer, {
    start: value,
    target: value,
    maxDigitsSeen: getNumDigits(value),
  });
  const { start, target, maxDigitsSeen } = leg;

  const direction: Direction = target > start ? "incr" : "decr";
  const stepDurationMs = useMemo(() => {
    const numSteps = Math.abs((target - start) / stepSize);
    return Math.trunc(animationDurationMs / numSteps);
  }, [animationDurationMs, start, target]);

  /**
   * The latest valid number along the animation leg that was reached by the concatenated slider digits.
   * Ex. In a leg from 8 -> 10, 19 would not be a valid number
   */
  const [currentValidNumber, setCurrentValidNumber] = useState(value);

  /**
   * Track digit slider states.
   * Store in reversed order, to append more digits as the number gets larger.
   * Note: the concatenated slider digits may not be valid in the animation leg,
   *   Ex. 8 -> 10 could result in a temporary state of 19.
   */
  const [reversedSliderStates, setReversedSliderStates] = useState(() => {
    const digits = getDigits(value).reverse();
    const animations = Array.from<Animation | undefined>({
      length: digits.length,
    });
    return {
      digits,
      animations,
    };
  });

  const nextState = useMemo(() => {
    const nextNumber =
      currentValidNumber === target
        ? target
        : direction === "incr"
          ? currentValidNumber + 1
          : currentValidNumber - 1;
    return {
      number: nextNumber,
      paddedDigits: getDigits(nextNumber, maxDigitsSeen),
    };
  }, [currentValidNumber, direction, maxDigitsSeen, target]);

  const onAnimationStart = useCallback(
    (animation: Animation, idxFromBack: number) => {
      setReversedSliderStates((prev) => {
        const animations = [...prev.animations];
        animations[idxFromBack] = animation;
        return {
          ...prev,
          animations,
        };
      });
    },
    [],
  );

  /**
   * update slider states ref to reflect new digit and completed animation
   * update current valid number if all digits have reached the next state
   */
  const onAnimationCompleted = useCallback(
    (newDigit: number | null, idxFromBack: number) => {
      setReversedSliderStates((prev) => {
        const digits = [...prev.digits];
        const animations = [...prev.animations];
        digits[idxFromBack] = newDigit;
        animations[idxFromBack] = undefined;
        const newState = {
          digits,
          animations,
        };

        // all digits reached next state
        const slidersNumber = parseInt(
          [...newState.digits].reverse().join(""),
          10,
        );
        if (slidersNumber === Math.abs(nextState.number)) {
          setCurrentValidNumber(nextState.number);
        }
        return newState;
      });
    },
    [nextState.number],
  );

  const isDuringAnimation = useMemo(() => {
    return reversedSliderStates.animations.some((animation) => !!animation);
  }, [reversedSliderStates.animations]);

  useLayoutEffect(() => {
    if (value === target || isDuringAnimation) return;

    // next time animation is stopped, update to new leg
    setLeg({ start: currentValidNumber, target: value });
  }, [currentValidNumber, isDuringAnimation, nextState.number, target, value]);

  return (
    <Flex
      className={styles.animatedInteger}
      align="center"
      style={
        {
          "--number-window-height": `${height}px`,
        } as CSSProperties
      }
    >
      {nextState.number < 0 && <Text className={textClassName}>-</Text>}
      {nextState.paddedDigits.map((nextDigit, idx) => {
        const idxFromBack = nextState.paddedDigits.length - 1 - idx;
        return (
          <DigitSlider
            key={idxFromBack}
            idxFromBack={idxFromBack}
            currentDigit={reversedSliderStates.digits[idxFromBack]}
            nextDigit={nextDigit}
            direction={direction}
            animation={reversedSliderStates.animations[idxFromBack]}
            // pause animations so parent can update leg
            pauseNextAnimation={target !== value}
            animationDurationMs={stepDurationMs}
            onAnimationStart={onAnimationStart}
            onAnimationCompleted={onAnimationCompleted}
            height={height}
            textClassName={textClassName}
          />
        );
      })}
    </Flex>
  );
}

interface DigitSliderProps {
  idxFromBack: number;
  currentDigit: number | null;
  nextDigit: number | null;
  direction: Direction;
  animation: Animation | undefined;
  pauseNextAnimation: boolean;
  onAnimationStart: (animation: Animation, idxFromBack: number) => void;
  onAnimationCompleted: (digit: number | null, idxFromBack: number) => void;
  animationDurationMs: number;
  height: number;
  textClassName?: string;
}

/**
 * Slide single visible digit from currently visible value to digitValue.
 * If digitValue changes during animation, wait until previous animation is completed
 * and then begin transition to digitValue.
 */
function DigitSlider({
  idxFromBack,
  currentDigit,
  nextDigit,
  direction,
  animation,
  pauseNextAnimation,
  onAnimationStart,
  onAnimationCompleted,
  animationDurationMs,
  height,
  textClassName,
}: DigitSliderProps) {
  const digitSliderRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // no changes during animation
    // start new animation if needed
    if (animation || pauseNextAnimation || currentDigit === nextDigit) {
      return;
    }
    const el = digitSliderRef.current;
    if (!el) {
      return;
    }

    const newAnimation = el.animate(
      direction === "incr"
        ? [
            { transform: `translateY(-${height}px)` },
            { transform: "translateY(0px)" },
          ]
        : [
            { transform: "translateY(0px)" },
            { transform: `translateY(-${height}px)` },
          ],
      {
        duration: animationDurationMs,
        easing: "ease-in-out",
        // keep transformed state until re-render
        fill: "forwards",
      },
    );

    onAnimationStart(newAnimation, idxFromBack);

    newAnimation.finished
      // ignore error on cancel
      .catch(() => {})
      // consider digit update complete, on both success or error
      .finally(() => {
        onAnimationCompleted(nextDigit, idxFromBack);
      });
  }, [
    animationDurationMs,
    currentDigit,
    height,
    nextDigit,
    direction,
    idxFromBack,
    pauseNextAnimation,
    onAnimationCompleted,
    animation,
    onAnimationStart,
  ]);

  useUnmount(() => {
    if (!animation) return;
    animation.cancel();
  });

  return (
    <Box className={styles.digitWindow}>
      <Flex
        ref={digitSliderRef}
        direction="column"
        className={styles.digitSlider}
      >
        <Digit
          className={textClassName}
          digit={direction === "incr" ? nextDigit : currentDigit}
        />
        <Digit
          className={textClassName}
          digit={direction === "incr" ? currentDigit : nextDigit}
        />
      </Flex>
    </Box>
  );
}

interface DigitProps {
  digit: number | null;
  className?: string;
}
function Digit({ digit, className }: DigitProps) {
  return (
    <Text
      className={clsx(className, styles.digit, {
        [styles.hidden]: digit == null,
      })}
    >
      {digit}
    </Text>
  );
}

/**
 * Given an integer (which may be negative), return an array of its digits,
 * optionally padded with nulls to make it at least minLength long.
 */
function getDigits(value: number, minLength?: number): (number | null)[] {
  const digits: (number | null)[] = Math.abs(value)
    .toString()
    .split("")
    .map((x) => parseInt(x, 10));

  if (minLength == null) return digits;

  const paddingSize = Math.max(0, minLength - digits.length);
  return [...Array<null>(paddingSize).fill(null), ...digits];
}

function getNumDigits(value: number) {
  return Math.abs(value).toString().length;
}
