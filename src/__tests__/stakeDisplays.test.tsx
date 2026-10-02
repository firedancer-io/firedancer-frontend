import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createStore, getDefaultStore, Provider } from "jotai";
import { Theme } from "@radix-ui/themes";
import type { ReactNode } from "react";
import type { PieSvgProps } from "@nivo/pie";
import type * as NivoPie from "@nivo/pie";
import { enableMapSet } from "immer";
import {
  gossipNetworkStatsAtom,
  identityKeyAtom,
  voteCommissionAtom,
  voteKeyAtom,
} from "../api/atoms";
import type {
  Epoch,
  GossipNetworkStats,
  GossipNetworkTraffic,
  Peer,
} from "../api/types";
import { useSetAtomWsData } from "../api/useSetAtomWsData";
import type { WsEntity } from "../api/worker/types";
import { defaultCtxValue, messageEventType } from "../api/ws/ConnectionContext";
import {
  currentSlotAtom,
  epochAtom,
  isDocumentVisibleAtom,
  peersAtom,
  peersInitializedAtom,
  updatePeersAtom,
} from "../atoms";
import IdentityKey from "../features/Header/IdentityKey";
import CardValidatorSummary, {
  CardValidatorSummaryMobile,
  CardValidatorSummaryTablet,
} from "../features/LeaderSchedule/Slots/CardValidatorSummary";
import { TrafficTreeMap } from "../features/Gossip/TrafficTreeMap";
import ValidatorStatsChart from "../features/Gossip/ValidatorStatsChart";
import StakeStatsChart from "../features/Gossip/StakeStatsChart";
import ValidatorsCard from "../features/Overview/ValidatorsCard";
import Gossip from "../features/StartupProgress/Firedancer/Gossip";

vi.mock("react-virtualized-auto-sizer", () => ({
  default: ({
    children,
  }: {
    children: (size: { width: number; height: number }) => ReactNode;
  }) => children({ width: 400, height: 300 }),
}));

vi.mock("@nivo/pie", async (importOriginal) => {
  const original = await importOriginal<typeof NivoPie>();
  return {
    ...original,
    Pie: (props: PieSvgProps<{ id: string; value: number; stake: bigint }>) => (
      <original.Pie
        {...props}
        layers={[
          ...(props.layers ?? ["arcs"]),
          ({ dataWithArc }) => (
            <g data-testid="stake-arcs">
              {dataWithArc.map((datum) => (
                <g
                  key={datum.id}
                  data-testid={`arc-${datum.id}`}
                  data-angle={datum.arc.angle}
                  data-stake={datum.data.stake.toString()}
                />
              ))}
            </g>
          ),
        ]}
      />
    ),
  };
});

vi.mock("../features/StartupProgress/Firedancer/PhaseHeader", () => ({
  default: ({ phaseCompleteFraction }: { phaseCompleteFraction: number }) => (
    <progress
      aria-label="Gossip progress"
      value={phaseCompleteFraction}
      max={1}
    />
  ),
}));

const clientMode = vi.hoisted(() => ({ firedancer: false }));

vi.mock("../client", () => ({
  client: "Frankendancer",
  isFrankendancer: true,
  get isFiredancer() {
    return clientMode.firedancer;
  },
}));

enableMapSet();

const sol = 1_000_000_000n;

function makeEpoch(
  entries: [string, bigint][] = [],
  excludedStake = 0n,
): Epoch {
  return {
    epoch: 1,
    start_slot: 100,
    end_slot: 199,
    start_time_nanos: null,
    end_time_nanos: null,
    staked_pubkeys: entries.map(([identity]) => identity),
    staked_lamports: entries.map(([, stake]) => stake),
    excluded_stake_lamports: excludedStake,
    leader_slots: [0],
  };
}

function makeVote(
  voteAccount: string,
  delinquent = false,
  commission = 5,
): Peer["vote"][number] {
  return {
    vote_account: voteAccount,
    last_vote: null,
    root_slot: null,
    epoch_credits: 0,
    commission,
    delinquent,
  };
}

function makePeer(identity: string, overrides: Partial<Peer> = {}): Peer {
  return {
    identity_pubkey: identity,
    gossip: {
      wallclock: 0,
      shred_version: 1,
      version: null,
      feature_set: null,
      sockets: {},
    },
    vote: [],
    info: null,
    ...overrides,
  };
}

function makeStore(epoch?: Epoch, initialized = true) {
  const store = createStore();
  store.set(peersInitializedAtom, initialized);
  store.set(currentSlotAtom, 100);
  if (epoch) store.set(epochAtom, epoch);
  return store;
}

function mount(ui: ReactNode, store = makeStore()) {
  return render(
    <Provider store={store}>
      <Theme>{ui}</Theme>
    </Provider>,
  );
}

function statValue(label: string, root: HTMLElement = document.body) {
  const labelElement = within(root).getByText(label, { exact: true });
  return labelElement.parentElement?.textContent
    ?.slice(label.length)
    .replace(/\s+/g, " ")
    .trim();
}

function arcFraction(id: string) {
  return (
    Number(screen.getByTestId(`arc-${id}`).getAttribute("data-angle")) /
    (2 * Math.PI)
  );
}

function expectTwoStakeSlices() {
  expect(
    within(screen.getByTestId("stake-arcs")).getAllByTestId(/^arc-/),
  ).toHaveLength(2);
  expect(screen.queryByTestId("arc-unknown")).toBeNull();
  expect(screen.queryByText(/unknown/i)).toBeNull();
  expect(arcFraction("non-delinquent") + arcFraction("delinquent")).toBeCloseTo(
    1,
  );
}

const traffic: GossipNetworkTraffic = {
  total_throughput: 1000,
  peer_names: [],
  peer_identities: ["self"],
  peer_throughput: [1000],
};

function networkStats(): GossipNetworkStats {
  return {
    health: {
      total_peers: 999,
      num_push_messages_rx_success: 0,
      num_push_messages_rx_failure: 0,
      num_push_entries_rx_success: 0,
      num_push_entries_rx_failure: 0,
      num_push_entries_rx_duplicate: 0,
      num_pull_response_messages_rx_success: 0,
      num_pull_response_messages_rx_failure: 0,
      num_pull_response_entries_rx_success: 0,
      num_pull_response_entries_rx_failure: 0,
      num_pull_response_entries_rx_duplicate: 0,
    },
    ingress: traffic,
    egress: { ...traffic, total_throughput: 2000 },
    storage: {
      capacity: 0,
      expired_count: 0,
      evicted_count: 0,
      count: [],
      count_tx: [],
      bytes_tx: [],
    },
    messages: {
      num_bytes_rx: [],
      num_bytes_tx: [],
      num_messages_rx: [],
      num_messages_tx: [],
    },
  };
}

beforeEach(() => {
  clientMode.firedancer = false;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("initial network stake loading", () => {
  let wasVisible: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    wasVisible = getDefaultStore().get(isDocumentVisibleAtom);
    getDefaultStore().set(isDocumentVisibleAtom, true);
  });

  afterEach(() => {
    cleanup();
    getDefaultStore().set(isDocumentVisibleAtom, wasVisible);
    act(() => void vi.runAllTimers());
    vi.useRealTimers();
  });

  function WsData() {
    useSetAtomWsData();
    return null;
  }

  function send(...items: WsEntity[]) {
    act(() => {
      defaultCtxValue.emitter.emit(messageEventType, { type: "kvb", items });
    });
  }

  function expectLoading() {
    expect(statValue("Non-delinquent Stake")).toBe("--");
    expect(statValue("Delinquent Stake")).toBe("--");
    expect(screen.queryByText(/\d+\.\d+%/)).toBeNull();
    expect(screen.queryAllByTestId(/^arc-/)).toHaveLength(0);
    expect(
      Array.from(
        document.querySelectorAll("svg tspan"),
        (span) => span.textContent,
      ),
    ).toEqual(["--", "--"]);
  }

  it.each([StakeStatsChart, ValidatorsCard])(
    "keeps placeholders until the healthy initial snapshot is applied without flashing 100 percent",
    (Component) => {
      const store = makeStore(undefined, false);
      mount(
        <>
          <WsData />
          <Component />
        </>,
        store,
      );
      send({
        topic: "epoch",
        key: "new",
        value: makeEpoch([
          ["delinquent", 10n * sol],
          ["vote-only", 90n * sol],
        ]),
      });
      expectLoading();
      act(() => void vi.advanceTimersByTime(60_000));
      expectLoading();
      send({
        topic: "peers",
        key: "update",
        value: {
          add: [
            makePeer("delinquent", { vote: [makeVote("d", true)] }),
            makePeer("vote-only", { gossip: null, vote: [makeVote("v")] }),
          ],
        },
      });
      expectLoading();
      act(() => void vi.advanceTimersByTime(999));
      expectLoading();
      act(() => void vi.advanceTimersByTime(1));
      expect(screen.queryByText("100.00%")).toBeNull();
      expect(screen.getByText("10.00%")).toBeTruthy();
      expect(screen.getByText("90.00%")).toBeTruthy();
      expectTwoStakeSlices();
      expect(arcFraction("delinquent")).toBeCloseTo(0.1);
      expect(arcFraction("non-delinquent")).toBeCloseTo(0.9);
      expect(statValue("Known staked validators")).toBe("2");
      expect(statValue("Gossip peers")).toBe("1");
    },
  );

  it.each([StakeStatsChart, ValidatorsCard])(
    "shows 100 percent only after an actual empty initial snapshot is applied",
    (Component) => {
      const store = makeStore(undefined, false);
      mount(
        <>
          <WsData />
          <Component />
        </>,
        store,
      );
      send(
        { topic: "epoch", key: "new", value: makeEpoch([["a", 100n * sol]]) },
        { topic: "peers", key: "update", value: { add: [] } },
      );
      expectLoading();
      act(() => void vi.advanceTimersByTime(1_000));
      expect(screen.getByText("100.00%")).toBeTruthy();
      expectTwoStakeSlices();
      expect(arcFraction("delinquent")).toBeCloseTo(1);
      expect(statValue("Known staked validators")).toBe("1");
      expect(statValue("Gossip peers")).toBe("0");
    },
  );

  it.each([StakeStatsChart, ValidatorsCard])(
    "keeps zero-total percentages unavailable after the initial empty snapshot",
    (Component) => {
      const store = makeStore(undefined, false);
      mount(
        <>
          <WsData />
          <Component />
        </>,
        store,
      );
      send(
        { topic: "epoch", key: "new", value: makeEpoch() },
        { topic: "peers", key: "update", value: { add: [] } },
      );
      expectLoading();
      act(() => void vi.advanceTimersByTime(1_000));
      expect(store.get(peersInitializedAtom)).toBe(true);
      expect(screen.queryByText(/\d+\.\d+%/)).toBeNull();
      expect(arcFraction("delinquent")).toBe(0);
      expect(arcFraction("non-delinquent")).toBe(0);
      expect(
        Array.from(
          document.querySelectorAll("svg tspan"),
          (span) => span.textContent,
        ),
      ).toEqual(["--", "--"]);
    },
  );
});

describe("network stake charts", () => {
  it.each([StakeStatsChart, ValidatorsCard])(
    "shows 10 percent delinquent out of 100 even with only 10 connected",
    (Component) => {
      const store = makeStore(
        makeEpoch([
          ["delinquent", 10n * sol],
          ["vote-only", 90n * sol],
        ]),
      );
      store.set(updatePeersAtom, [
        makePeer("delinquent", { vote: [makeVote("d", true)] }),
        makePeer("vote-only", { gossip: null, vote: [makeVote("v")] }),
      ]);
      const { container } = mount(<Component />, store);

      expect(screen.getByText("10.00%")).toBeTruthy();
      expect(screen.getByText("90.00%")).toBeTruthy();
      expect(container.querySelectorAll("svg tspan")).toHaveLength(2);
      expectTwoStakeSlices();
      expect(arcFraction("delinquent")).toBeCloseTo(0.1);
      expect(arcFraction("non-delinquent")).toBeCloseTo(0.9);
      expect(statValue("Known staked validators")).toBe("2");
      expect(statValue("Gossip peers")).toBe("1");
    },
  );

  it.each([StakeStatsChart, ValidatorsCard])(
    "includes excluded, missing, removed, and no-vote stake in delinquent geometry",
    (Component) => {
      const store = makeStore(
        makeEpoch(
          [
            ["healthy", 30n * sol],
            ["delinquent", 10n * sol],
            ["missing", 20n * sol],
            ["removed", 5n * sol],
            ["empty", 15n * sol],
          ],
          20n * sol,
        ),
      );
      store.set(peersAtom, {
        healthy: makePeer("healthy", { vote: [makeVote("h")] }),
        delinquent: makePeer("delinquent", { vote: [makeVote("d", true)] }),
        removed: makePeer("removed", {
          removed: true,
          vote: [makeVote("r")],
        }),
        empty: makePeer("empty"),
      });
      mount(<Component />, store);

      expect(screen.getByText("30.00%")).toBeTruthy();
      expect(screen.getByText("70.00%")).toBeTruthy();
      expectTwoStakeSlices();
      expect(arcFraction("non-delinquent")).toBeCloseTo(0.3);
      expect(arcFraction("delinquent")).toBeCloseTo(0.7);
      expect(
        screen.getByTestId("arc-delinquent").getAttribute("data-stake"),
      ).toBe(String(70n * sol));
      expect(statValue("Known staked validators")).toBe("5");
      expect(statValue("Gossip peers")).toBe("3");
    },
  );

  it.each(["delinquent vote-only", "missing and excluded"])(
    "shows 100 percent delinquent with disconnected %s stake",
    (coverage) => {
      const store = makeStore(
        coverage === "delinquent vote-only"
          ? makeEpoch([
              ["connected", 10n * sol],
              ["vote-only", 90n * sol],
            ])
          : makeEpoch(
              [
                ["connected", 10n * sol],
                ["missing", 70n * sol],
              ],
              20n * sol,
            ),
      );
      store.set(updatePeersAtom, [
        makePeer("connected", { vote: [makeVote("a", true)] }),
        makePeer("vote-only", { gossip: null, vote: [makeVote("b", true)] }),
      ]);
      mount(<StakeStatsChart />, store);
      expect(screen.getByText("100.00%")).toBeTruthy();
      expect(screen.getByText("0.00%")).toBeTruthy();
      expectTwoStakeSlices();
      expect(arcFraction("delinquent")).toBeCloseTo(1);
      expect(statValue("Gossip peers")).toBe("1");
    },
  );

  it("classifies the full identity stake by any non-delinquent vote", async () => {
    const store = makeStore(makeEpoch([["mixed", 30n * sol]], 70n * sol));
    store.set(updatePeersAtom, [
      makePeer("mixed", {
        gossip: null,
        vote: [makeVote("d", true), makeVote("n")],
      }),
    ]);
    const { container } = mount(<StakeStatsChart />, store);
    expect(screen.getByText("30.00%")).toBeTruthy();
    expect(screen.getByText("70.00%")).toBeTruthy();
    expectTwoStakeSlices();
    expect(arcFraction("non-delinquent")).toBeCloseTo(0.3);
    expect(arcFraction("delinquent")).toBeCloseTo(0.7);
    expect(statValue("Gossip peers")).toBe("0");
    fireEvent.mouseEnter(container.querySelector("path")!);
    expect(
      await screen.findByText(
        /peer is present, not removed, and any vote account is non-delinquent according to the backend, regardless of gossip connectivity/,
      ),
    ).toBeTruthy();
  });

  it.each(["non-delinquent", "delinquent"])(
    "uses exact raw bigint tooltip amounts for the %s slice",
    async (id) => {
      const stake = 9_007_199_254_740_993n;
      const { container } = mount(
        <ValidatorStatsChart
          nonDelinquentStake={stake}
          delinquentStake={stake}
          totalNetworkStake={stake * 2n}
        />,
      );
      expectTwoStakeSlices();
      expect(arcFraction(id)).toBeCloseTo(0.5);
      expect(screen.getByTestId(`arc-${id}`).getAttribute("data-stake")).toBe(
        stake.toString(),
      );
      fireEvent.mouseEnter(
        container.querySelectorAll("path")[id === "non-delinquent" ? 0 : 1],
      );
      expect(
        await screen.findByText(
          new RegExp(`${stake.toLocaleString()} lamports`),
        ),
      ).toBeTruthy();
      expect(
        screen.getByText(
          /50.00% of total network stake, including excluded stake/,
        ),
      ).toBeTruthy();
      expect(
        screen.getByText(
          id === "non-delinquent"
            ? /full effective current epoch stake is non-delinquent/
            : /All remaining effective current epoch stake is delinquent: identities with all vote accounts delinquent, missing or removed peers, peers without vote accounts, and excluded stake/,
        ),
      ).toBeTruthy();
      expect(
        screen.queryByText(
          new RegExp(`${BigInt(Number(stake)).toLocaleString()} lamports`),
        ),
      ).toBeNull();
      expect(screen.queryByText(/unknown/i)).toBeNull();
    },
  );

  it.each([StakeStatsChart, ValidatorsCard])(
    "keeps gossip counts and unavailable stake fields visible before the epoch",
    (Component) => {
      const store = makeStore();
      store.set(peersAtom, {
        connected: makePeer("connected"),
        removed: makePeer("removed", { removed: true }),
        voteOnly: makePeer("voteOnly", { gossip: null, vote: [makeVote("v")] }),
      });
      mount(<Component />, store);
      expect(statValue("Gossip peers")).toBe("1");
      expect(statValue("Known staked validators")).toBe("--");
      expect(statValue("Non-delinquent Stake")).toBe("--");
      expect(statValue("Delinquent Stake")).toBe("--");
      expect(screen.queryByText(/\d+\.\d+%/)).toBeNull();
      expect(screen.queryAllByTestId(/^arc-/)).toHaveLength(0);
      expect(screen.queryByText(/unknown/i)).toBeNull();
      expect(
        Array.from(
          document.querySelectorAll("svg tspan"),
          (span) => span.textContent,
        ),
      ).toEqual(["--", "--"]);
    },
  );

  it.each([StakeStatsChart, ValidatorsCard])(
    "does not show false zero percentages for a zero network total",
    (Component) => {
      mount(<Component />, makeStore(makeEpoch()));
      expect(screen.queryByText(/\d+\.\d+%/)).toBeNull();
      expect(screen.queryByText(/unknown/i)).toBeNull();
      expect(screen.getAllByTestId(/^arc-/)).toHaveLength(2);
      expect(arcFraction("non-delinquent")).toBe(0);
      expect(arcFraction("delinquent")).toBe(0);
      expect(
        Array.from(
          document.querySelectorAll("svg tspan"),
          (span) => span.textContent,
        ),
      ).toEqual(["--", "--"]);
      expect(statValue("Non-delinquent Stake")).toBe(
        Component === ValidatorsCard ? "0SOL" : "0",
      );
      expect(statValue("Delinquent Stake")).toBe(
        Component === ValidatorsCard ? "0SOL" : "0",
      );
    },
  );
});

describe("identity and leader epoch amounts", () => {
  it("shows header stake without a peer and total network percentage", () => {
    const store = makeStore(makeEpoch([["self", 10n * sol]], 90n * sol));
    store.set(identityKeyAtom, "self");
    mount(<IdentityKey />, store);
    expect(statValue("Stake Amount")).toBe("10 SOL");
    expect(statValue("Stake %")).toBe("10 %");
  });

  it.each([
    [undefined, "--", "--"],
    [makeEpoch([], 100n * sol), "--", "--"],
    [makeEpoch([["other", 100n * sol]]), "0 SOL", "0 %"],
    [makeEpoch([["self", 0n]]), "0 SOL", "--"],
  ])(
    "distinguishes unknown, absent, and zero-total header stake",
    (epoch, amount, pct) => {
      const store = makeStore(epoch);
      store.set(identityKeyAtom, "self");
      mount(<IdentityKey />, store);
      expect(statValue("Stake Amount")).toBe(amount);
      expect(statValue("Stake %")).toBe(pct);
    },
  );

  it("uses the configured Frankendancer vote account for commission and pubkey", async () => {
    const store = makeStore();
    store.set(identityKeyAtom, "self");
    store.set(voteKeyAtom, "configured");
    store.set(updatePeersAtom, [
      makePeer("self", {
        vote: [makeVote("first", false, 99), makeVote("configured", true, 7)],
      }),
    ]);
    const { container } = mount(<IdentityKey />, store);
    expect(statValue("Commission")).toBe("7 %");
    fireEvent.click(container.querySelector('[aria-haspopup="dialog"]')!);
    const dialog = await screen.findByRole("dialog");
    expect(statValue("Vote Pubkey", dialog)).toBe("configured");
    expect(statValue("Commission", dialog)).toBe("7 %");
    act(() => store.set(voteKeyAtom, "unobserved"));
    expect(statValue("Vote Pubkey", dialog)).toBe("unobserved");
    expect(statValue("Commission", dialog)).toBe("--");
  });

  it("preserves Firedancer summary commission", () => {
    clientMode.firedancer = true;
    const store = makeStore();
    store.set(voteCommissionAtom, 725);
    mount(<IdentityKey />, store);
    expect(statValue("Commission")).toBe("7.25 %");
  });

  it.each([
    CardValidatorSummary,
    CardValidatorSummaryTablet,
    CardValidatorSummaryMobile,
  ])(
    "uses the schedule identity stake with missing, delinquent, or removed metadata",
    (Component) => {
      const store = makeStore(makeEpoch([["self", 10n * sol]], 90n * sol));
      const { container } = mount(<Component slot={100} />, store);
      const dropdown = container.querySelector('[aria-haspopup="dialog"]');
      if (dropdown) fireEvent.click(dropdown);
      expect(screen.getByText("10 SOL • 10%")).toBeTruthy();
      expect(screen.getByText("Offline")).toBeTruthy();
      act(() =>
        store.set(updatePeersAtom, [
          makePeer("self", { vote: [makeVote("d", true)] }),
        ]),
      );
      expect(screen.getByText("10 SOL • 10%")).toBeTruthy();
      expect(screen.queryByText("Offline")).toBeNull();
      act(() =>
        store.set(peersAtom, {
          self: makePeer("self", {
            removed: true,
            vote: [makeVote("d", true)],
          }),
        }),
      );
      expect(screen.getByText("10 SOL • 10%")).toBeTruthy();
      expect(screen.getByText("Offline")).toBeTruthy();
    },
  );

  it("shows unavailable leader stake before the epoch and unavailable percentage for zero total", () => {
    const store = makeStore();
    mount(<CardValidatorSummary slot={100} />, store);
    expect(screen.getByText("--")).toBeTruthy();
    act(() => store.set(epochAtom, makeEpoch([["self", 0n]])));
    expect(screen.getByText("0 SOL • --")).toBeTruthy();
  });
});

describe("traffic and startup gossip stake", () => {
  it("keeps treemap epoch stake and percentage independent of missing or delinquent peers", async () => {
    const stake = 9_007_199_254_740_993n;
    const store = makeStore(makeEpoch([["self", stake]], stake * 9n));
    mount(<TrafficTreeMap networkTraffic={traffic} label="Ingress" />, store);
    expect(screen.getByText("10.00%")).toBeTruthy();
    act(() =>
      store.set(updatePeersAtom, [
        makePeer("self", { vote: [makeVote("d", true)] }),
      ]),
    );
    expect(screen.getByText("10.00%")).toBeTruthy();
    fireEvent.mouseEnter(screen.getByText("10.00%"));
    expect(await screen.findByRole("tooltip")).toBeTruthy();
    expect(screen.getByRole("tooltip").textContent).toContain(
      `${stake.toLocaleString()} lamports`,
    );
  });

  it.each([
    [undefined, "--"],
    [makeEpoch([], 100n * sol), "--"],
    [makeEpoch([["other", 100n * sol]]), "0%"],
    [makeEpoch([["self", 0n]]), "--"],
  ])("keeps unknown treemap stake distinct from zero", (epoch, pct) => {
    mount(
      <TrafficTreeMap networkTraffic={traffic} label="Ingress" />,
      makeStore(epoch),
    );
    expect(screen.getByText(pct, { exact: true })).toBeTruthy();
    if (pct === "--")
      expect(screen.queryByText("0%", { exact: true })).toBeNull();
  });

  it("shows gossip progress and throughput before the epoch, then epoch connected lower bounds", async () => {
    const store = makeStore();
    store.set(updatePeersAtom, [
      makePeer("self", { vote: [makeVote("d", true)] }),
      makePeer("unmapped"),
      makePeer("vote-only", { gossip: null, vote: [makeVote("v")] }),
    ]);
    store.set(gossipNetworkStatsAtom, networkStats());
    mount(<Gossip />, store);
    expect(statValue("Gossip peers")).toBe("2");
    expect(statValue("Known staked peers")).toBe("--");
    expect(statValue("Known connected stake")).toBe("--");
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe(
      String(2 / 5000),
    );
    expect(await screen.findByText("8 Kbps")).toBeTruthy();
    expect(screen.getByText("16 Kbps")).toBeTruthy();
    act(() =>
      store.set(
        epochAtom,
        makeEpoch(
          [
            ["self", 10n * sol],
            ["vote-only", 30n * sol],
          ],
          60n * sol,
        ),
      ),
    );
    expect(statValue("Known staked peers")).toBe("1");
    expect(statValue("Known connected stake")).toBe("10 SOL");
    fireEvent.focus(screen.getByText("Known connected stake").parentElement!);
    expect((await screen.findByRole("tooltip")).textContent).toContain(
      "Lower bound",
    );
  });

  it("keeps peer-count progress visible before network throughput stats arrive", () => {
    const store = makeStore();
    store.set(updatePeersAtom, [makePeer("self")]);
    mount(<Gossip />, store);
    expect(statValue("Gossip peers")).toBe("1");
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe(
      String(1 / 5000),
    );
    expect(screen.getAllByText("-- Mbps")).toHaveLength(2);
  });
});
