import { Flex, Text } from "@radix-ui/themes";
import { formatIECBytes } from "../../../utils";
import styles from "./cacheSpace.module.css";

interface CacheSpaceProps {
  usedBytes: number;
  usedPct: number;
  unusedPct: number;
  color: string;
  unusedColor: string;
}

export default function CacheSpace({
  usedBytes,
  usedPct,
  unusedPct,
  color,
  unusedColor,
}: CacheSpaceProps) {
  const used = formatIECBytes(usedBytes);
  return (
    <Flex align="center" gap="8px">
      <Text
        className={styles.label}
        align="right"
      >{`${used.value} ${used.unit}`}</Text>

      <Flex className={styles.container} width="100%" height="12px">
        <Flex
          width={`${usedPct}%`}
          height="100%"
          style={{ background: color }}
        />
        <Flex
          width={`${unusedPct}%`}
          height="100%"
          style={{ background: unusedColor }}
        />
      </Flex>
    </Flex>
  );
}
