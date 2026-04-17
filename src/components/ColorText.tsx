import { useEffect, useRef } from "react";
import { Text } from "@radix-ui/themes";

interface ColorTextProps {
  value: string;
  changedColor: string;
  unchangedColor: string;
  className?: string;
}

/* Determines whether the char at idx of value has changed from its corresponding
 * char in prevValue. The corresponding char is determined based on position
 * relative to the decimal (a missing decimal is treated as a decimal at the end
 * of the string). This is to handle cases where the number of digits are
 * different between value and prevValue (e.g. 9.99 -> 10.00 and 9.99 -> 9.999) */
function isCharChanged(idx: number, value: string, prevValue: string): boolean {
  const decimalIdx = value.indexOf(".");
  const prevDecimalIdx = prevValue.indexOf(".");

  const decimalPos = decimalIdx !== -1 ? decimalIdx : value.length;
  const prevDecimalPos =
    prevDecimalIdx !== -1 ? prevDecimalIdx : prevValue.length;

  const offsetFromDecimal = idx - decimalPos;
  const prevIdx = prevDecimalPos + offsetFromDecimal;

  return (
    prevIdx < 0 ||
    prevIdx >= prevValue.length ||
    value[idx] !== prevValue[prevIdx]
  );
}

export default function ColorText({
  value,
  changedColor,
  unchangedColor,
  className,
}: ColorTextProps) {
  const prevValueRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    prevValueRef.current = value;
  }, [value]);

  return (
    <Text className={className}>
      {value.split("").map((char, idx) => {
        const changed =
          prevValueRef.current === undefined ||
          isCharChanged(idx, value, prevValueRef.current);
        return (
          <span
            key={idx}
            style={{ color: changed ? changedColor : unchangedColor }}
          >
            {char}
          </span>
        );
      })}
    </Text>
  );
}
