import { Text } from "@radix-ui/themes";

interface PctBarRowProps {
  value: number;
  total: number;
  valueColor: string;
  showBackground?: boolean;
}

export default function PctBar({
  value,
  total,
  valueColor,
  showBackground,
}: PctBarRowProps) {
  const pct = Math.round(total ? (value / total) * 100 : 0);

  return (
    <>
      <svg
        height="8"
        width="100%"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ alignSelf: "center" }}
      >
        <rect height="8" width={`${pct}%`} opacity={0.6} fill={valueColor} />
        {showBackground && (
          <rect
            height="8"
            width={`${100 - pct}%`}
            x={`${pct}%`}
            opacity={0.2}
            fill={valueColor}
          />
        )}
      </svg>
    </>
  );
}
