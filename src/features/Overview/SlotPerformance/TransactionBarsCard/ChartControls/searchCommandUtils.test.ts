import { describe, it, expect } from "vitest";
import {
  getSignatureTextSegments,
  signatureHighlightContextChars,
  signatureStartEndChars,
} from "./searchCommandUtils";
import type { TextSegment } from "./StyledTextRow";
import { nonBreakingSpace } from "../../../../../consts";

const signature =
  "3cEsvAY9ewxyrGeUq39ua4G4nwuZKHZGKLSqPdYBiCBK6bP7TZ8LQTLGZYVCGvZjPy9mNVXzSu3pQX6R73Ho76Xq";
const signatureStart = signature.substring(0, signatureStartEndChars);
const signatureEnd = signature.substring(
  signature.length - signatureStartEndChars,
);
const optionValue = signature.toLowerCase();
const defaultSignatureText = `${signatureStart}...${signatureEnd}`;

function combineSegments(segments: TextSegment[]) {
  if (!segments.length) return segments;
  return segments.reduce<TextSegment[]>(
    (acc, cur, i) => {
      if (i < 1) return acc;
      const prev = acc[acc.length - 1];
      // Doesn't check the truncateLastSegment flag as signature text segments don't use it
      if (prev.faded === cur.faded) {
        prev.text += cur.text;
      } else {
        acc.push(cur);
      }
      return acc;
    },
    [segments[0]],
  );
}

describe("signature text segment formatting", () => {
  it("no search", () => {
    const result: TextSegment[] = [{ text: defaultSignatureText, faded: true }];

    expect(
      combineSegments(
        getSignatureTextSegments("", {
          signature: signature,
          optionValue: optionValue,
          txnIdxCount: 1,
        }),
      ),
    ).toEqual(result);
  });

  it("fully matching search", () => {
    const result: TextSegment[] = [{ text: defaultSignatureText }];
    expect(
      combineSegments(
        getSignatureTextSegments(signature, {
          signature: signature,
          optionValue: optionValue,
          txnIdxCount: 1,
        }),
      ),
    ).toEqual(result);
  });

  it("matching search with txn count", () => {
    const result: TextSegment[] = [
      { text: `${defaultSignatureText}` },
      { text: `${nonBreakingSpace}(3)`, faded: true },
    ];
    expect(
      combineSegments(
        getSignatureTextSegments(signature, {
          signature: signature,
          optionValue: optionValue,
          txnIdxCount: 3,
        }),
      ),
    ).toEqual(result);
  });

  it("too long matching search", () => {
    const result: TextSegment[] = [{ text: defaultSignatureText }];
    expect(
      combineSegments(
        getSignatureTextSegments(
          signature.substring(0, signatureStartEndChars + 1),
          {
            signature: signature,
            optionValue: optionValue,
            txnIdxCount: 1,
          },
        ),
      ),
    ).toEqual(result);
  });

  it("matching search start", () => {
    const result: TextSegment[] = [
      { text: signature.substring(0, 3) },
      { text: signature.substring(3, signatureStartEndChars), faded: true },
      { text: "...", faded: true },
      { text: signatureEnd, faded: true },
    ];
    expect(
      combineSegments(
        getSignatureTextSegments(signature.substring(0, 3), {
          signature: signature,
          optionValue: optionValue,
          txnIdxCount: 1,
        }),
      ),
    ).toEqual(combineSegments(result));
  });

  it("matching search middle", () => {
    const middleIdx = Math.floor(signature.length / 2);
    const matchingMiddleText = signature.substring(middleIdx, middleIdx + 3);
    const result: TextSegment[] = [
      { text: signatureStart, faded: true },
      { text: "...", faded: true },
      {
        text: signature.substring(
          middleIdx - signatureHighlightContextChars,
          middleIdx,
        ),
        faded: true,
      },
      { text: matchingMiddleText },
      {
        text: signature.substring(
          middleIdx + 3,
          middleIdx + 3 + signatureHighlightContextChars,
        ),
        faded: true,
      },
      { text: "...", faded: true },
      { text: signatureEnd, faded: true },
    ];

    expect(
      combineSegments(
        getSignatureTextSegments(matchingMiddleText, {
          signature: signature,
          optionValue: optionValue,
          txnIdxCount: 1,
        }),
      ),
    ).toEqual(combineSegments(result));
  });

  it("matching search end with txn count", () => {
    const result: TextSegment[] = [
      { text: signatureStart, faded: true },
      { text: "...", faded: true },
      { text: signatureEnd.substring(0, signatureEnd.length - 3), faded: true },
      { text: signatureEnd.substring(signatureEnd.length - 3) },
      { text: `${nonBreakingSpace}(3)`, faded: true },
    ];
    expect(
      combineSegments(
        getSignatureTextSegments(signature.substring(signature.length - 3), {
          signature: signature,
          optionValue: optionValue,
          txnIdxCount: 3,
        }),
      ),
    ).toEqual(combineSegments(result));
  });

  it("matching search start-middle", () => {
    const searchValue = signature.substring(
      signatureStartEndChars - 3,
      signatureStartEndChars + 3,
    );
    const searchValueStartIdx = signature.indexOf(searchValue);
    const searchValueEndIdx = searchValueStartIdx + 6;
    const result: TextSegment[] = [
      { text: signature.substring(0, searchValueStartIdx), faded: true },
      {
        text: signature.substring(searchValueStartIdx, searchValueEndIdx),
      },
      {
        text: signature.substring(
          searchValueEndIdx,
          searchValueEndIdx + signatureHighlightContextChars,
        ),
        faded: true,
      },
      { text: "...", faded: true },
      { text: signatureEnd, faded: true },
    ];
    expect(
      combineSegments(
        getSignatureTextSegments(searchValue, {
          signature: signature,
          optionValue: optionValue,
          txnIdxCount: 1,
        }),
      ),
    ).toEqual(combineSegments(result));
  });
});
