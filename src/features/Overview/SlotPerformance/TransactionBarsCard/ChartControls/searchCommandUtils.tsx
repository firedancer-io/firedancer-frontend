import styles from "./searchCommand.module.css";
import { Flex, Text } from "@radix-ui/themes";
import clsx from "clsx";

export const desiredScaleTotalMultiplier = 30;
// How many characters to wait before showing search results
export const searchLengthThreshold = 0;
// How many characters to show at the start and end of the txn signature
export const startEndCharCount = 10;
// How much of a buffer between search index and the start/end of the txn signature
export const ellipsisCount = 3;

export function getSignatureLabelFn(
  signature: string,
  optionValue: string,
  txnIdxCount: number,
) {
  return function getLabel(searchValue: string) {
    searchValue = searchValue.trim();
    if (searchValue.length < searchLengthThreshold) {
      return "";
    }

    const searchStartIdx = optionValue.indexOf(searchValue.toLowerCase());
    if (searchStartIdx < 0) {
      return "";
    }

    if (searchValue.length === optionValue.length || searchValue.length > 10) {
      return (
        <Text>
          {signature.substring(0, startEndCharCount)}...
          {signature.substring(signature.length - startEndCharCount)}
        </Text>
      );
    }

    const searchEndIdx = searchStartIdx + searchValue.length;

    let startIdx = Math.min(startEndCharCount - 1, searchStartIdx);
    let endIdx = Math.max(
      optionValue.length - startEndCharCount - 1,
      searchEndIdx,
    );
    let startEllipsis = true;
    let endEllipsis = true;

    // Extending/reducing the start/end idx if the ellipsis would cover less than ellipsisCount characters
    if (startIdx + ellipsisCount >= searchStartIdx) {
      startIdx = searchStartIdx;
      startEllipsis = false;
    }
    if (endIdx - ellipsisCount <= searchEndIdx) {
      endIdx = searchEndIdx;
      endEllipsis = false;
    }

    const hasMultiple = txnIdxCount > 1;

    return (
      <Flex flexGrow="1">
        <Text className={styles.faded}>
          {signature.substring(0, startIdx)}
          {startEllipsis && "..."}
          {/* Extends out the start if search text is smaller than startEndCharCount and is within start of signature */}
          {searchStartIdx > signature.length - startEndCharCount &&
            signature.substring(
              signature.length - startEndCharCount,
              searchStartIdx,
            )}
          <Text className={styles.highlight}>
            {signature.substring(searchStartIdx, searchEndIdx)}
          </Text>
          {/* Extends out the end if search text is smaller than startEndCharCount and is within end of signature */}
          {searchEndIdx < startEndCharCount &&
            signature.substring(searchEndIdx, startEndCharCount)}
          {endEllipsis && "..."}
          {signature.substring(endIdx)}
          {hasMultiple ? ` (${txnIdxCount})` : ""}
        </Text>
      </Flex>
    );
  };
}

export function findIpMatch(ip: string, searchValue: string) {
  searchValue = searchValue.trim();
  if (!searchValue) return;

  if (searchValue.includes(".")) {
    const idx = ip.indexOf(searchValue);
    if (idx < 0) return;
    return { startIdx: idx, endIdx: idx + searchValue.length };
  }

  // Build digits-only string and map digit index -> original index
  const digitToOrig: number[] = [];
  let digitsOnly = "";
  for (let i = 0; i < ip.length; i++) {
    const ch = ip[i];
    if (ch >= "0" && ch <= "9") {
      digitsOnly += ch;
      digitToOrig.push(i);
    }
  }

  const idx = digitsOnly.indexOf(searchValue);
  if (idx < 0) return;

  const startIdx = digitToOrig[idx];
  const endIdx = digitToOrig[idx + searchValue.length - 1] + 1;
  return { startIdx, endIdx };
}

export function getIpLabelFn(
  ip: string,
  txnIdxCount: number,
  peerName?: string | null,
) {
  return function getLabel(searchValue: string) {
    if (searchValue.length < searchLengthThreshold) {
      return "";
    }

    const ipMatch = findIpMatch(ip, searchValue);
    const hasMultiple = txnIdxCount > 1;

    const startIdx = ipMatch?.startIdx ?? -1;
    const endIdx = ipMatch?.endIdx ?? -1;

    return (
      <Flex flexGrow="1" gap="1" minWidth="0" wrap="nowrap">
        <Text className={styles.faded}>
          {ip.substring(0, startIdx)}
          <Text className={styles.highlight}>
            {ip.substring(startIdx, endIdx)}
          </Text>
          {ip.substring(endIdx)}
          {hasMultiple ? ` (${txnIdxCount})` : ""}
        </Text>
        {peerName && (
          <Text className={clsx(styles.highlight, styles.ellipsis)}>
            {peerName}
          </Text>
        )}
      </Flex>
    );
  };
}
