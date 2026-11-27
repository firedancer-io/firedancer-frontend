import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import VoteLineLegend from "./VoteLineLegend";

afterEach(cleanup);

describe("VoteLineLegend", () => {
  it("lists our votes only while they are drawn", () => {
    const shown = render(<VoteLineLegend showOwnVotes />);
    for (const label of ["Our notar vote", "Our finalize vote"]) {
      expect(shown.queryByText(label)).not.toBeNull();
    }
    cleanup();
    expect(
      render(<VoteLineLegend showOwnVotes={false} />).queryByText(
        "Our notar vote",
      ),
    ).toBeNull();
  });
});
