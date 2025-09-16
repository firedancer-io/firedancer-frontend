import { nonBreakingSpace } from "../../../../../consts";
import type { TextSegment } from "./StyledTextRow";
import StyledTextRow from "./StyledTextRow";

/** How many characters to show at the start and end of the txn signature, collapsing the text inbetween to ellipsis */
export const signatureStartEndChars = 8;
/** Minimum characters between an ellipsis and nearby visible text before we collapse the gap */
export const signatureEllipsisChars = 2;
/** How many context characters to include on both sides of the highlighted match */
export const signatureHighlightContextChars = 2;

type Range = { start: number; end: number };

/**
 * Splits the signature into multiple text segments for display.
 * By default, the signature is truncated in the middle with ellipsis.
 * If searchValue is found within the signature, that segment will be shown non-faded. The surrounding characters of the matched segment will also be shown but faded.
 * If there are multiple transactions for the same txn signature, then a count will be shown in parenthesis next to the signature.
 */
export function getSignatureTextSegments(
  _searchValue: string,
  {
    signature,
    optionValue: _optionValue,
    txnIdxCount,
  }: GetSignatureLabelFnOptions,
): TextSegment[] {
  const hasMultipleMatchingTxns = txnIdxCount > 1;
  const searchValue = _searchValue.trim().toLowerCase();
  const optionValue = _optionValue.toLowerCase();

  const addTxnMatchCount = (segments: TextSegment[]) => {
    if (hasMultipleMatchingTxns) {
      segments.push({
        text: `${nonBreakingSpace}(${txnIdxCount})`,
        faded: true,
      });
    }
  };

  if (
    searchValue.length === optionValue.length ||
    // Return the default fully highlighted and middle truncated signature if search match length is too long
    searchValue.length > signatureStartEndChars
  ) {
    const segments: TextSegment[] = [
      {
        text: `${signature.substring(0, signatureStartEndChars)}...${signature.substring(signature.length - signatureStartEndChars)}`,
      },
    ];
    addTxnMatchCount(segments);
    return segments;
  }

  const searchStartIdx = optionValue.indexOf(searchValue);
  const searchEndIdx = searchStartIdx + searchValue.length;

  const ranges: Range[] = [
    // Start segment before elllipsis
    { start: 0, end: Math.min(signatureStartEndChars, signature.length) },
    // Segment matching search and including highlight context characters on both sides
    {
      start: Math.max(
        0,
        Math.min(
          searchStartIdx - signatureHighlightContextChars,
          signature.length,
        ),
      ),
      end: Math.min(
        signature.length,
        Math.min(
          searchEndIdx + signatureHighlightContextChars,
          signature.length,
        ),
      ),
    },
    // End segment after ellipsis
    {
      start: Math.max(0, signature.length - signatureStartEndChars),
      end: signature.length,
    },
  ]
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  // Merge overlapping ranges and small gaps between the start/end segments and the highlight segment so ellipsis aren't used when the gap is small (<= signatureEllipsisChars).
  const mergedRanges: Range[] = [];
  for (const cur of ranges) {
    if (!mergedRanges.length) {
      mergedRanges.push({ ...cur });
      continue;
    }

    const last = mergedRanges[mergedRanges.length - 1];
    const gap = cur.start - last.end;

    if (gap <= 0 || gap <= signatureEllipsisChars) {
      last.end = Math.max(last.end, cur.end);
    } else {
      mergedRanges.push({ ...cur });
    }
  }

  const segments: TextSegment[] = [];
  for (let i = 0; i < mergedRanges.length; i++) {
    const range = mergedRanges[i];

    // Add ellipsis segment between gaps
    if (i > 0) {
      segments.push({ text: "...", faded: true });
    }

    const rangeSearchStartIdx = Math.max(
      range.start,
      Math.min(searchStartIdx, range.end),
    );
    const rangeSearchEndIdx = Math.max(
      range.start,
      Math.min(searchEndIdx, range.end),
    );

    const hasSearchMatchWithinRange = rangeSearchEndIdx > rangeSearchStartIdx;

    if (hasSearchMatchWithinRange) {
      if (range.start < rangeSearchStartIdx) {
        segments.push({
          text: signature.substring(range.start, rangeSearchStartIdx),
          faded: true,
        });
      }
      // Segment that matches the search
      segments.push({
        text: signature.substring(rangeSearchStartIdx, rangeSearchEndIdx),
      });
      if (rangeSearchEndIdx < range.end) {
        segments.push({
          text: signature.substring(rangeSearchEndIdx, range.end),
          faded: true,
        });
      }
    } else {
      segments.push({
        text: signature.substring(range.start, range.end),
        faded: true,
      });
    }
  }

  addTxnMatchCount(segments);
  return segments.filter(({ text }) => text);
}

interface GetSignatureLabelFnOptions {
  signature: string;
  optionValue: string;
  txnIdxCount: number;
}

export function getSignatureLabelFn(options: GetSignatureLabelFnOptions) {
  return function getLabel(searchValue: string) {
    return (
      <StyledTextRow
        textSegments={getSignatureTextSegments(searchValue, options)}
      />
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
    if (!searchValue.length) {
      return "";
    }

    const ipMatch = findIpMatch(ip, searchValue);
    const hasMultiple = txnIdxCount > 1;

    const highlightStartIdx = ipMatch?.startIdx ?? -1;
    const highlightEndIdx = ipMatch?.endIdx ?? -1;

    const textSegments: TextSegment[] = [
      { text: ip.substring(0, highlightStartIdx), faded: true },
      {
        text: ip.substring(highlightStartIdx, highlightEndIdx),
      },
      { text: ip.substring(highlightEndIdx), faded: true },
      {
        text: hasMultiple ? `${nonBreakingSpace}(${txnIdxCount})` : "",
        faded: true,
      },
      {
        text: peerName ? `${nonBreakingSpace}${peerName}` : "",
      },
    ];

    return <StyledTextRow textSegments={textSegments} truncateLastSegment />;
  };
}
