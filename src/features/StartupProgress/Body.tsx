import { useAtom, useAtomValue } from "jotai";
import { startupProgressAtom } from "../../api/atoms";
import styles from "./body.module.css";
import { ReactNode, useEffect, useRef, useState } from "react";
import { showStartupProgressAtom } from "./atoms";
import fdLogo from "../../assets/firedancer.svg";
import { Box, Flex } from "@radix-ui/themes";
import { StartupPhase } from "../../api/types";
import { isDefined } from "../../utils";
import IncompleteStep from "./IncompleteStep";
import InprogressStep from "./InprogressStep";
import CompleteStep from "./CompleteStep";
import LoadingLedgerProgress from "./LedgerProgress";
import FullSnapshotProgress from "./FullSnapshotProgress";
import { peersAtom } from "../../atoms";
import IncrementalSnapshotProgress from "./IncrementalSnapshotProgress";
import { animated, useSpring } from "@react-spring/web";
import FullSnapshotStats from "./FullSnapshotStats";
import {
  SupermajorityStakeProgress,
  SupermajorityStakeStats,
} from "./SupermajorityStakeProgress";
import IncrementalSnapshotStats from "./IncrementalSnapshotStats";

const steps: {
  step: StartupPhase;
  rightChildren?: ReactNode;
  bottomChildren?: ReactNode;
  optional?: boolean;
}[] = [
  { step: "initializing" },
  {
    step: "searching_for_full_snapshot",
  },
  {
    step: "downloading_full_snapshot",
    rightChildren: <FullSnapshotProgress />,
    bottomChildren: <FullSnapshotStats />,
  },
  {
    step: "searching_for_incremental_snapshot",
  },
  {
    step: "downloading_incremental_snapshot",
    rightChildren: <IncrementalSnapshotProgress />,
    bottomChildren: <IncrementalSnapshotStats />,
  },
  { step: "cleaning_blockstore" },
  { step: "cleaning_accounts" },
  { step: "loading_ledger" },
  { step: "processing_ledger", bottomChildren: <LoadingLedgerProgress /> },
  { step: "starting_services" },
  {
    step: "waiting_for_supermajority",
    rightChildren: <SupermajorityStakeProgress />,
    bottomChildren: <SupermajorityStakeStats />,
    optional: true,
  },
  { step: "running" },
];

const startupMinTime = 3_000;

export default function Body() {
  const startupProgress = useAtomValue(startupProgressAtom);
  const [showStartupProgress, setShowStartupProgress] = useAtom(
    showStartupProgressAtom
  );
  const timeoutRef = useRef<NodeJS.Timeout>();
  const peers = useAtomValue(peersAtom);
  const hasPeers = !!Object.values(peers).length;

  const [_hideSteps, setHideSteps] = useState<boolean>();

  useEffect(() => {
    setHideSteps((prev) => {
      if (!startupProgress) return prev;

      return startupProgress.phase === "running";
    });
  }, [startupProgress]);

  const hideSteps = _hideSteps === true || _hideSteps === undefined;

  useEffect(() => {
    if (hasPeers && startupProgress?.phase === "running") {
      setShowStartupProgress(false);
    } else {
      timeoutRef.current = setTimeout(
        () => setShowStartupProgress(startupProgress?.phase !== "running"),
        startupMinTime
      );
    }

    return () => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    };
  }, [
    hasPeers,
    setShowStartupProgress,
    showStartupProgress,
    startupProgress?.phase,
  ]);

  const currentStepIndex = Math.max(
    0,
    steps.findIndex(({ step }) => step === startupProgress?.phase)
  );

  const [springs, api] = useSpring(() => ({
    from: {
      opacity: showStartupProgress ? 1 : 0,
      zIndex: showStartupProgress ? 1 : -1,
    },
  }));

  useEffect(() => {
    api.stop();
    if (showStartupProgress) {
      void api.start({
        from: { opacity: 1, zIndex: 1 },
      });
    } else {
      void api.start({
        from: { opacity: 1, zIndex: 1 },
        to: { opacity: 0, zIndex: -1 },
      });
    }
  }, [api, showStartupProgress]);

  return (
    <animated.div className={styles.container} style={springs}>
      <Flex direction="column" gap="4" minWidth="410px">
        <Box flexGrow="1" />
        <img
          src={fdLogo}
          alt="fd"
          height="50px"
          style={{ marginBottom: "28px" }}
        />
        {steps.map(({ step, rightChildren, bottomChildren, optional }, i) => {
          if (optional && step !== startupProgress?.phase) return null;

          const label = getLabel(step);

          if (i === currentStepIndex) {
            return (
              <InprogressStep
                key={step}
                label={label}
                hide={hideSteps}
                rightChildren={rightChildren}
                bottomChildren={bottomChildren}
              />
            );
          }
          if (i < currentStepIndex) {
            return <CompleteStep key={step} label={label} hide={hideSteps} />;
          }
          return <IncompleteStep key={step} label={label} hide={hideSteps} />;
        })}
        <Box flexGrow="1" />
      </Flex>
    </animated.div>
  );
}

function getLabel(step: string) {
  return step
    .split("_")
    .filter(isDefined)
    .map((split, i) => {
      if (split === "for") return split;
      if (split === "rpc") return "RPC";
      return (i === 0 ? split[0].toUpperCase() : split[0]) + split.slice(1);
    })
    .join(" ");
}
