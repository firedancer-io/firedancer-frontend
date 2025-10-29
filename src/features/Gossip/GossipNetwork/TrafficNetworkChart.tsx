import { useAtomValue } from "jotai";
import { gossipNetworkStatsAtom } from "../../../api/atoms";
import type { InputLink, InputNode, LinkProps, NodeProps } from "@nivo/network";
import { Network } from "@nivo/network";
import { useMemo, useRef, useState } from "react";
import { Flex, SegmentedControl, Slider, Switch, Text } from "@radix-ui/themes";
import type { GossipNetworkStats } from "../../../api/types";
import { usePreviousDistinct } from "react-use";
import { peersAtom } from "../../../atoms";

const innerNodeId = "default";
const size = 600;
const midPoint = size / 2;
const radius = 150;
let gradient = "sqrt";
let log = 0.5;
let spin = false;
let isCircular = true;
const msInterval = 100;
let t0 = 0;

interface TrafficNode extends InputNode {
  peerIdentity?: string;
  name?: string;
  throughput?: number;
  pct?: number;
  x?: number;
  y?: number;
  isEgress?: boolean;
}

/**
 * Clamp a value to [0, 1].
 */
function clamp01(x: number): number {
  if (Number.isNaN(x)) return NaN;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// Option A: [0,1] -> [0,1] style transforms
function sqrtTransform(x: number): number {
  // return (Math.sqrt(clamp01(x)));
  return Math.sqrt(Math.sqrt(clamp01(x)));
}

/**
 * Logit-like monotone mapping from [0,1] to [0,1].
 * Applies logit, scales in log-odds space, then maps back with the logistic.
 *
 * Params:
 * - x: input in [0,1]
 * - k: slope in log-odds space. k=1 => identity. 0<k<1 spreads tails,
 *      k>1 compresses tails and expands the middle.
 * - c: fixed point (f(c)=c), default 0.5. Keep in (0,1).
 * - eps: tiny clamp to avoid infinities at 0 or 1.
 */
export function logit01(
  x: number,
  k: number = 0.4,
  c: number = 0.5,
  eps: number = 1e-6,
): number {
  const clamp = (v: number) => Math.min(1 - eps, Math.max(eps, v));

  const a = clamp(x);
  const cc = clamp(c);

  const logit = (v: number) => Math.log(v / (1 - v));

  // Logistic (numerically stable)
  const logistic = (t: number): number => {
    if (t >= 0) {
      const z = Math.exp(-t);
      return 1 / (1 + z);
    } else {
      const z = Math.exp(t);
      return z / (1 + z);
    }
  };

  // Scale around fixed point in log-odds space so f(c)=c
  const lc = logit(cc);
  const yLogit = k * (logit(a) - lc) + lc;

  const y = logistic(yLogit);
  return y <= 0 ? 0 : y >= 1 ? 1 : y;
}

function getGradientColor(pct?: number, secondaryColor?: boolean) {
  pct ??= 0;
  if (gradient === "sqrt") {
    pct = sqrtTransform(pct);
  } else if (gradient === "log") {
    pct = logit01(pct, log);
  }
  if (secondaryColor) return `rgba(196, 107, 240, ${pct})`;
  return `rgba(28, 231, 194, ${pct})`;
}

function getNodeColor({ id, throughput, pct }: TrafficNode) {
  if (id === innerNodeId) return "#1CE7C2";
  return getGradientColor(0.1);
}

function getLinkColor({
  source,
  target,
}: {
  source: { data: TrafficNode };
  target: { data: TrafficNode };
}) {
  return getGradientColor(source.data.pct ?? target.data.pct);
}

function retainNodeOrder(
  networkTraffic: GossipNetworkStats["egress"],
  prevData?: TrafficNode[],
) {
  const { peer_identities, peer_names, peer_throughput, total_throughput } =
    networkTraffic;
  if (
    !peer_identities ||
    !peer_names ||
    !peer_throughput ||
    total_throughput == null
  )
    return;

  const links: InputLink[] = [];
  const newNodes = prevData
    ? prevData.filter(({ id }) => id !== innerNodeId).slice(spin ? 1 : 0)
    : new Array<TrafficNode | null>(64).fill(null);

  for (let i = 0; i < newNodes.length; i++) {
    const identity = newNodes[i]?.peerIdentity;
    if (!identity) continue;

    if (!peer_identities.includes(identity)) {
      newNodes[i] = null;
    }
  }

  let newNodeIdx = 0;
  for (let i = 0; i < peer_identities.length; i++) {
    const id = peer_identities[i];
    let matchingNode = newNodes.find(
      (node) => node?.peerIdentity === peer_identities[i],
    );

    if (!matchingNode) {
      matchingNode = {
        id,
        peerIdentity: peer_identities[i],
      };

      while (newNodeIdx < newNodes.length && newNodes[newNodeIdx] !== null) {
        newNodeIdx++;
      }

      newNodes[newNodeIdx] = matchingNode;
      newNodeIdx++;
    }

    matchingNode.name = peer_names?.[i];
    matchingNode.throughput = peer_throughput?.[i];

    // const matchingPrevIdx =
    //   prevNetworkTraffic?.peer_identities?.findIndex(
    //     (peerIdentity) => peerIdentity === matchingNode.peerIdentity,
    //   ) ?? -1;
    // if (
    //   prevNetworkTraffic?.peer_throughput?.[matchingPrevIdx] != null &&
    //   matchingNode.throughput != null
    // ) {
    //   const t1 = performance.now();
    //   const diffPct = Math.min(1, (t1 - t0) / msInterval);
    //   // 1.log(diffPct)
    //   const throughputDiff =
    //     (matchingNode.throughput -
    //       prevNetworkTraffic.peer_throughput?.[matchingPrevIdx]) *
    //     diffPct;
    //   matchingNode.throughput += throughputDiff;
    // }

    matchingNode.pct = (matchingNode.throughput ?? 0) / (total_throughput || 1);
    links.push({
      source: id,
      target: innerNodeId,
    });
  }

  return { nodes: newNodes.filter((n) => !!n), links };
}

function calcCoors(node: TrafficNode, idx: number, totalIdx: number) {
  if (isCircular) {
    const multiplier = node.isEgress ? 1.5 : 1;
    const angle = (2 * Math.PI * idx) / totalIdx;
    node.x = Math.cos(angle) * radius * multiplier;
    node.y = Math.sin(angle) * radius * multiplier;
  } else {
    const sizeWithBuffer = size * 0.8;
    if (node.isEgress) {
      node.x = sizeWithBuffer / 2;
    } else {
      node.x = -sizeWithBuffer / 2;
    }
    node.y = (idx / totalIdx) * sizeWithBuffer - sizeWithBuffer / 2;
  }
}

export default function TrafficNetworkChart() {
  const networkStats = useAtomValue(gossipNetworkStatsAtom);
  const prevNetworkStats = usePreviousDistinct(networkStats);
  const [animate, setAnimate] = useState(false);
  const [includeEgress, setIncludeEgress] = useState(false);
  const peers = useAtomValue(peersAtom);

  const ingressDataRef = useRef<{
    nodes: TrafficNode[];
    links: InputLink[];
  }>();
  const egressDataRef = useRef<{
    nodes: TrafficNode[];
    links: InputLink[];
  }>();
  // const render = useUpdate();
  // useInterval(render, 10);

  const ingressData = useMemo(() => {
    const ingress = networkStats?.ingress;
    if (!ingress) return;

    const retainedOrder = retainNodeOrder(
      networkStats.ingress,
      ingressDataRef.current?.nodes,
    );
    if (!retainedOrder) return;

    const { nodes, links } = retainedOrder;

    nodes.forEach((node, i) => {
      calcCoors(node, i, nodes.length);
    });

    t0 = performance.now();
    return {
      nodes: [{ id: innerNodeId }, ...nodes],
      links,
    };
  }, [networkStats]);
  ingressDataRef.current = ingressData;

  const egressData = useMemo(() => {
    const egress = networkStats?.egress;
    // if (true) return;
    if (!egress) return;

    const retainedOrder = retainNodeOrder(
      networkStats.egress,
      egressDataRef.current?.nodes,
    );
    if (!retainedOrder) return;

    const { nodes, links } = retainedOrder;

    nodes.forEach((node, i) => {
      node.isEgress = true;
      calcCoors(node, i, nodes.length);
      if (node.id.indexOf("egress") < 0) {
        node.id += "egress";
      }
    });

    links.forEach((link, i) => {
      if (link.source.indexOf("egress") < 0) {
        link.source += "egress";
      }
    });

    return { nodes, links };
  }, [networkStats]);
  egressDataRef.current = egressData;

  const nodeSize = 13;

  const chartData = useMemo(() => {
    if (!ingressData) return;

    const chartData = {
      ...ingressData,
      nodes: [...ingressData.nodes],
      links: [...ingressData.links],
    };
    if (egressData && chartData.nodes && includeEgress) {
      chartData.nodes = [...chartData.nodes, ...egressData.nodes];
      if (!isCircular) {
        chartData.links = [...chartData.links, ...egressData.links];
      }
    }
    return chartData;
  }, [ingressData, egressData, includeEgress]);

  if (!chartData) return null;

  return (
    <div>
      <SegmentedControl.Root
        defaultValue="sqrt"
        onValueChange={(value) => (gradient = value)}
      >
        <SegmentedControl.Item value="linear">linear</SegmentedControl.Item>
        <SegmentedControl.Item value="sqrt">sqrt</SegmentedControl.Item>
        <SegmentedControl.Item value="log">log</SegmentedControl.Item>
      </SegmentedControl.Root>
      <div style={{ width: "300px", padding: "8px 0" }}>
        <Slider
          defaultValue={[0.5]}
          onValueChange={(value) => {
            log = value[0];
          }}
          min={0}
          max={1}
          step={0.05}
          disabled={gradient !== "log"}
        />
      </div>
      {/* Animate <Switch checked={animate} onCheckedChange={setAnimate}></Switch> */}
      Spin <Switch onCheckedChange={(value) => (spin = value)}></Switch>
      Egress{" "}
      <Switch checked={includeEgress} onCheckedChange={setIncludeEgress} />
      Circular{" "}
      <Switch
        defaultChecked
        onCheckedChange={(value) => (isCircular = value)}
      />
      <Flex direction="column">
        <Text>
          Total throughput ingress:{" "}
          {networkStats?.ingress.total_throughput?.toLocaleString()}
        </Text>
        <Text>
          Total throughput egress:{" "}
          {networkStats?.egress.total_throughput?.toLocaleString()}
        </Text>
      </Flex>
      <Network
        animate={animate}
        height={size}
        width={size}
        data={chartData}
        // margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        // linkDistance={(t) => t.distance}
        linkDistance={(t) => radius}
        // nodeSize={0}
        nodeSize={(t) => (t.id === innerNodeId ? 70 : nodeSize)}
        // nodeSize={(t) => t.size}
        activeNodeSize={(t) => 2 * nodeSize}
        inactiveNodeSize={0}
        // nodeColor={getNodeColor}
        // linkColor={getLinkColor}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        centeringStrength={2}
        repulsivity={100}
        // motionConfig="stiff"
        // distanceMin={0}
        linkThickness={(t) => 2}
        nodeTooltip={({ node }) => {
          const peer = peers[node.data.peerIdentity ?? ""];

          return (
            <div>
              <div>{node.data.peerIdentity}</div>
              <div>{node.data.name ?? peer.info?.name}</div>
              <div>{node.data.throughput?.toLocaleString()} bytes/s</div>
            </div>
          );
        }}
        nodeComponent={CustomNodeComponent}
        linkComponent={CustomLinkComponent}
        // linkThickness={(t) => 2 + 2 * t.target.data.height}
        // linkBlendMode="multiply"
      ></Network>
    </div>
  );
}

const CustomNodeComponent = ({
  node,
  animated: animatedProps,
  onClick,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
}: NodeProps<TrafficNode>) => {
  if (node.data.id === innerNodeId) {
    return <circle cx={midPoint} cy={midPoint} r="11" fill="#1CE7C2" />;
  }

  // const fill = getGradientColor(0.1, false);
  const fill = getGradientColor(node.data.pct, node.data.isEgress);

  return (
    <circle
      cx={((node.data.x ?? 0) + midPoint)}
      cy={(node.data.y ?? 0) + midPoint}
      r="7"
      // opacity="1"
      fill={fill}
      onClick={onClick ? (event) => onClick(node, event) : undefined}
      onMouseEnter={
        onMouseEnter ? (event) => onMouseEnter(node, event) : undefined
      }
      onMouseMove={
        onMouseMove ? (event) => onMouseMove(node, event) : undefined
      }
      onMouseLeave={
        onMouseLeave ? (event) => onMouseLeave(node, event) : undefined
      }
    />
  );
};

const CustomLinkComponent = ({ link }: LinkProps<TrafficNode, InputLink>) => {
  if (link.source.data.isEgress && isCircular) return null;

  return (
    <line
      x1={midPoint}
      y1={midPoint}
      x2={(link.source.data.x ?? 0) + midPoint}
      y2={(link.source.data.y ?? 0) + midPoint}
      // stroke={link.color}
      stroke={getGradientColor(link.source.data.pct, link.source.data.isEgress)}
      // stroke={getGradientColor(Math.max(0, (link.source.data.pct ?? 0) - 0.001))}
      strokeWidth={link.thickness}
      // strokeDasharray="5 7"
      strokeLinecap="round"
    />
  );
};
