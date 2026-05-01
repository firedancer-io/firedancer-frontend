import { useEffect, useRef, type CSSProperties } from "react";
import { Text } from "@radix-ui/themes";

interface ColorTextProps {
  value: string;
  changedColor: string;
  unchangedColor: string;
  className?: string;
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
      {value.split("").map((char, i) => (
        <span
          key={i}
          style={
            {
              color:
                prevValueRef.current === undefined ||
                char !== prevValueRef.current[i]
                  ? changedColor
                  : unchangedColor,
            } as CSSProperties
          }
        >
          {char}
        </span>
      ))}
    </Text>
  );
}
