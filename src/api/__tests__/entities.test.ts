import { describe, expect, it } from "vitest";
import { summarySchema } from "../entities";

describe("summarySchema Alpenglow messages", () => {
  it("accepts the consensus mode flag", () => {
    expect(
      summarySchema.parse({
        topic: "summary",
        key: "is_alpenglow",
        value: true,
      }),
    ).toEqual({
      topic: "summary",
      key: "is_alpenglow",
      value: true,
    });
  });

  it("accepts a vote slot that is not available yet", () => {
    expect(
      summarySchema.parse({
        topic: "summary",
        key: "vote_slot",
        value: null,
      }),
    ).toEqual({
      topic: "summary",
      key: "vote_slot",
      value: null,
    });
  });
});
