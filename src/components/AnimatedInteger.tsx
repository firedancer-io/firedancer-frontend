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
import { Box, Flex, Text, type TextProps } from "@radix-ui/themes";
import { useUnmount } from "react-use";
import useIsDocumentVisible from "../hooks/useIsDocumentVisible";

const MIN_ANIMATION_DURATION_MS = 20;

interface AnimatedIntegerProps {
  value: number;
  animationDurationMs: number;
  height: number;
  textSize?: TextProps["size"];
}

/**
 * Animate individual digits to reach the desired value.
 * Animation occurs one step at a time, even if the value jumps by > 1.
 */
export default function AnimatedInteger(props: AnimatedIntegerProps) {
  const isDocumentVisible = useIsDocumentVisible();

  // re-mount when visible again, so there's no need to catch up
  return isDocumentVisible ? <AnimatedIntegerInner {...props} /> : null;
}

type Direction = "incr" | "decr";

type AnimationLeg = {
  start: number;
  target: number;
  maxDigitsSeen: number;
};
/**
 * Update animation leg.
 * Keep track of the longest number of digits we've seen for
 * correct transitions as the front digits animate to / from null
 */
function animationLegReducer(
  prev: AnimationLeg,
  values: { start: number; target: number },
) {
  const { start, target } = values;
  return {
    start,
    target,
    maxDigitsSeen: Math.max(
      prev.maxDigitsSeen,
      getNumDigits(start),
      getNumDigits(target),
    ),
  };
}

function AnimatedIntegerInner({
  value,
  animationDurationMs,
  height,
  textSize,
}: AnimatedIntegerProps) {
  const [leg, setLeg] = useReducer(animationLegReducer, {
    start: value,
    target: value,
    maxDigitsSeen: getNumDigits(value),
  });
  const { start, target, maxDigitsSeen } = leg;

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

  const direction: Direction = target > start ? "incr" : "decr";

  // if you fall too far behind, jump to the target in one step
  const { stepDurationMs, shouldJumpToTarget } = useMemo(() => {
    const numSteps = Math.abs(target - start);
    const stepDurationMs = Math.trunc(animationDurationMs / numSteps);
    if (stepDurationMs < MIN_ANIMATION_DURATION_MS) {
      return {
        stepDurationMs: animationDurationMs, // jump to target in one step
        shouldJumpToTarget: true,
      };
    }
    return {
      stepDurationMs: numSteps ? stepDurationMs : 0,
      shouldJumpToTarget: false,
    };
  }, [animationDurationMs, start, target]);

  const nextState = useMemo(() => {
    const nextNumber =
      currentValidNumber === target || shouldJumpToTarget
        ? target
        : direction === "incr"
          ? currentValidNumber + 1
          : currentValidNumber - 1;
    return {
      number: nextNumber,
      paddedDigits: getDigits(nextNumber, maxDigitsSeen),
    };
  }, [
    currentValidNumber,
    direction,
    maxDigitsSeen,
    shouldJumpToTarget,
    target,
  ]);

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
   * update slider states to reflect new digit and completed animation
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
    <div
      className={styles.container}
      style={
        {
          "--number-window-height": `${height}px`,
        } as CSSProperties
      }
    >
      <Flex className={styles.animatedInteger} inert="true">
        {nextState.number < 0 && <Text size={textSize}>-</Text>}
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
              textSize={textSize}
            />
          );
        })}
      </Flex>

      {/* Add hidden Text to support selection / copy of the full number (digits components are not selectable). */}
      <Text size={textSize} className={styles.selectionText}>
        {currentValidNumber}
      </Text>
    </div>
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
  textSize?: TextProps["size"];
}

/**
 * Slide the single visible digit from current to next.
 * Only runs one animation at a time.
 * NOTE: Parent should update current and next digits only during animation gaps,
 *   to prevent the digits from changing during animation.
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
  textSize,
}: DigitSliderProps) {
  const digitSliderRef = useRef<HTMLDivElement>(null);

  // Track animation to be able to cancel it even if component is unmounted before parent state is updated
  const localAnimationRef = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    // no changes during animation
    // start new animation if needed
    if (animation || pauseNextAnimation || currentDigit === nextDigit) {
      return;
    }

    const el = digitSliderRef.current;
    if (!el) return;

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

    localAnimationRef.current = newAnimation;
    onAnimationStart(newAnimation, idxFromBack);

    newAnimation.finished
      // ignore error on cancel
      .catch(() => {})
      // consider digit update complete, on both success or error
      .finally(() => {
        localAnimationRef.current = null;
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
    localAnimationRef.current?.cancel();
  });

  return (
    <Box className={styles.digitWindow}>
      <Flex
        ref={digitSliderRef}
        direction="column"
        className={styles.digitSlider}
      >
        <Digit
          textSize={textSize}
          digit={direction === "incr" ? nextDigit : currentDigit}
        />
        <Digit
          textSize={textSize}
          digit={direction === "incr" ? currentDigit : nextDigit}
        />
      </Flex>
    </Box>
  );
}

interface DigitProps {
  digit: number | null;
  textSize?: TextProps["size"];
}
/**
 * Display a single digit that will be in a slider.
 * Use null for a leading 0. Hide on null, but have the component ready
 * in the slider for animation to other values.
 */
function Digit({ digit, textSize }: DigitProps) {
  return (
    <Text
      size={textSize}
      className={clsx(styles.digit, {
        [styles.hidden]: digit == null,
      })}
    >
      {digit}
    </Text>
  );
}

/**
 * Given an integer return an array of its digits. Ignore negative sign.
 * Optionally pad output with nulls in front, to make it at least minLength long.
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

/**
 * Given an integer, return the number of digits it has. Ignore negative signs.
 */
function getNumDigits(value: number) {
  return Math.abs(value).toString().length;
}
