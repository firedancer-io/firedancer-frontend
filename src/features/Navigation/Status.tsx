import { useAtomValue } from "jotai";
import type { Status } from "../../atoms";
import { statusAtom } from "../../atoms";
import { useMemo } from "react";
import { DotFilledIcon } from "@radix-ui/react-icons";
import historyIcon from "../../assets/history.svg";
import futureIcon from "../../assets/future.svg";
import { Flex, Text, Tooltip } from "@radix-ui/themes";
import styles from "./status.module.css";
import clsx from "clsx";

const statusToLabel: Record<Status, string> = {
  Live: "RT",
  Past: "PT",
  Current: "CT",
  Future: "FT",
};

export function StatusIndicator() {
  const status = useAtomValue(statusAtom);

  const text = useMemo(() => {
    if (!status) return null;
    return status === "Live" ? (
      <Tooltip
        content="Following the current leader slot"
        disableHoverableContent
      >
        <Text>{statusToLabel[status]}</Text>
      </Tooltip>
    ) : (
      <Tooltip
        content={`Focused on ${status.toLowerCase()} slot`}
        disableHoverableContent
      >
        <Text>{statusToLabel[status]}</Text>
      </Tooltip>
    );
  }, [status]);

  const icon = useMemo(() => {
    if (!status) return null;
    return (
      <Tooltip content={status} disableHoverableContent>
        {status === "Live" ? (
          <DotFilledIcon />
        ) : (
          <img
            src={status === "Past" ? historyIcon : futureIcon}
            alt={status}
          />
        )}
      </Tooltip>
    );
  }, [status]);

  if (!status) return null;

  return (
    <Flex
      width="35px"
      justify="between"
      align="center"
      className={clsx(
        status === "Live"
          ? styles.statusIndicatorLive
          : styles.statusIndicatorNotLive,
      )}
    >
      {text}
      {icon}
    </Flex>
  );
}
