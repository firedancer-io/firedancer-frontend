import { useAtomValue, useSetAtom } from "jotai";
import styles from "./body.module.css";
import { useEffect, useMemo } from "react";
import {
  bootProgressBarPctAtom,
  bootProgressPhaseAtom,
  isStartupProgressExpandedAtom,
  showStartupProgressAtom,
} from "../atoms";
import { Box, Container, Flex, Text } from "@radix-ui/themes";
import clsx from "clsx";
import { ProgressBar } from "./ProgressBar";
import { Header } from "./Header";
import { BootPhaseEnum } from "../../../api/entities";
import { getTimeTillText } from "../../../utils";
import { bootProgressContainerElAtom } from "../../../atoms";
import { GossipProgress } from "./GossipProgress";
import { steps } from "./consts";
import type { BootPhase } from "../../../api/types";
import Logo from "./Logo";
import { appMaxWidth } from "../../../consts";
import { SnapshotProgress } from "./SnapshotProgress";
import { useUptimeDuration } from "../../../hooks/useUptime";
import CatchingUp from "./CatchingUp";

const classNames: { [phase in BootPhase]?: string } = {
  [BootPhaseEnum.joining_gossip]: styles.gossip,
  [BootPhaseEnum.loading_full_snapshot]: styles.fullSnapshot,
  [BootPhaseEnum.loading_incremental_snapshot]: styles.incrSnapshot,
  [BootPhaseEnum.catching_up]: styles.catchingUp,
};

export default function Body() {
  const setShowStartupProgress = useSetAtom(showStartupProgressAtom);
  const phase = useAtomValue(bootProgressPhaseAtom);

  // close startup when running, reopen on restart
  useEffect(() => {
    setShowStartupProgress(phase !== "running");
  }, [setShowStartupProgress, phase]);

  return (
    <>
      {phase && <BootProgressContent phase={phase} />}
      <Logo />
    </>
  );
}

interface BootProgressContentProps {
  phase: BootPhase;
}
function BootProgressContent({ phase }: BootProgressContentProps) {
  const setBootProgressContainerEl = useSetAtom(bootProgressContainerElAtom);
  const showStartupProgress = useAtomValue(showStartupProgressAtom);
  const isStartupProgressExpanded = useAtomValue(isStartupProgressExpandedAtom);

  const phaseClass = phase ? classNames[phase] : "";

  return (
    <Container
      ref={(el: HTMLDivElement) => setBootProgressContainerEl(el)}
      maxWidth={appMaxWidth}
      height="100%"
      className={clsx(styles.container, phaseClass, {
        [styles.collapsed]: !showStartupProgress || !isStartupProgressExpanded,
      })}
      p="4"
    >
      <Flex direction="column" height="100%">
        <PhaseHeader phase={phase} />

        <Box pt="6" flexGrow="1">
          {phase === BootPhaseEnum.joining_gossip && <GossipProgress />}
          {(phase === BootPhaseEnum.loading_full_snapshot ||
            phase === BootPhaseEnum.loading_incremental_snapshot) && (
            <SnapshotProgress />
          )}
          {phase === BootPhaseEnum.catching_up && <CatchingUp />}
        </Box>
      </Flex>
    </Container>
  );
}

function TotalDuration() {
  const uptimeDuration = useUptimeDuration(1_000);

  return (
    <Text>
      {uptimeDuration == null ? "--" : getTimeTillText(uptimeDuration)}
    </Text>
  );
}

function PhaseHeader({ phase }: { phase: BootPhase }) {
  const step = steps[phase];
  const phasePct = useAtomValue(bootProgressBarPctAtom);

  const prevPhasesPctSum = useMemo(() => {
    return (
      Object.values(steps).reduce((acc, { index, estimatedPct }) => {
        if (index < step.index) {
          acc += estimatedPct;
        }
        return acc;
      }, 0) * 100
    );
  }, [step]);

  const overallPct =
    prevPhasesPctSum + Math.round(step.estimatedPct * phasePct);

  return (
    <Box flexShrink="0">
      <Header />
      <Flex justify="between" mt="4" mb="20px" className={styles.stepContainer}>
        <span>
          <Text className={styles.secondaryText}>Elapsed </Text>
          <TotalDuration />
        </span>
        <Text className={styles.stepName}>{step.name}</Text>
        <span>
          <Text>{overallPct}% </Text>
          <Text className={styles.secondaryText}>Complete</Text>
        </span>
      </Flex>

      <ProgressBar stepIndex={step.index} />
    </Box>
  );
}
