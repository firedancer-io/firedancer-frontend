import { describe, expect, it } from "vitest";
import { networkProtocols } from "../consts";

describe("networkProtocols", () => {
  /* The rows of the network cards are labelled by array index, so this
     list has to stay as long as the protocol array the server sends.
     Alpenglow servers append votor as a seventh entry; a short list
     silently renders that row with no label. */

  it("labels every protocol an Alpenglow server sends", () => {
    expect(networkProtocols).toEqual([
      "turbine",
      "gossip",
      "tpu",
      "repair",
      "rserve",
      "metrics",
      "votor",
    ]);
  });

  it("keeps the pre-Alpenglow protocols at their original indices", () => {
    expect(networkProtocols.slice(0, 6)).toEqual([
      "turbine",
      "gossip",
      "tpu",
      "repair",
      "rserve",
      "metrics",
    ]);
  });
});
