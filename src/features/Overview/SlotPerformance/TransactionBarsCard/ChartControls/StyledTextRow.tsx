import styles from "./styledTextRow.module.css";
import { Flex, Text } from "@radix-ui/themes";
import clsx from "clsx";

export interface TextSegment {
  text: string;
  faded?: boolean;
}

interface StyledTextRowProps {
  textSegments: TextSegment[];
  truncateLastSegment?: boolean;
}

export default function StyledTextRow({
  textSegments,
  truncateLastSegment,
}: StyledTextRowProps) {
  return (
    <Flex
      flexGrow="1"
      minWidth="0"
      maxWidth="100%"
      wrap="nowrap"
      className={styles.text}
      aria-label={textSegments.map(({ text }) => text).join("")}
    >
      {textSegments.map(({ text, faded }, idx) => {
        if (!text) return null;

        return (
          <Text
            key={idx}
            className={clsx({
              [styles.faded]: faded,
              [styles.ellipsis]:
                idx === textSegments.length - 1 && truncateLastSegment,
            })}
          >
            {text}
          </Text>
        );
      })}
    </Flex>
  );
}
