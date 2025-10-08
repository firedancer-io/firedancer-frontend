import { useAtomValue, useSetAtom } from "jotai";
import styles from "./body.module.css";
import { useEffect, useMemo, useState } from "react";
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
import { formatDuration } from "../../../utils";
import { bootProgressContainerElAtom } from "../../../atoms";
import { GossipProgress } from "./GossipProgress";
import { steps } from "./consts";
import type { BootPhase } from "../../../api/types";
import Logo from "./Logo";
import { appMaxWidth } from "../../../consts";
import { SnapshotProgress } from "./SnapshotProgress";
import { startupTimeAtom } from "../../../api/atoms";

const classNames: { [phase in BootPhase]?: string } = {
  [BootPhaseEnum.joining_gossip]: styles.gossip,
  [BootPhaseEnum.loading_full_snapshot]: styles.fullSnapshot,
  [BootPhaseEnum.loading_incremental_snapshot]: styles.incrSnapshot,
  [BootPhaseEnum.catching_up]: styles.catchingUp,
};

export default function Body() {
  const setShowStartupProgress = useSetAtom(showStartupProgressAtom);
  const phase = useAtomValue(bootProgressPhaseAtom);

  // close startup when complete
  useEffect(() => {
    if (phase === "running") {
      setShowStartupProgress(false);
    }
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
      className={clsx(styles.container, phaseClass, {
        [styles.collapsed]: !showStartupProgress || !isStartupProgressExpanded,
      })}
      p="4"
    >
      <PhaseHeader phase={phase} />

      <Box pt="6" flexGrow="1">
        {phase === BootPhaseEnum.joining_gossip && <GossipProgress />}
        {(phase === BootPhaseEnum.loading_full_snapshot ||
          phase === BootPhaseEnum.loading_incremental_snapshot) && (
          <SnapshotProgress />
        )}
      </Box>
    </Container>
  );
}

function getDurationSeconds(startNanos: bigint | undefined) {
  if (startNanos == null) return;
  const durationMs = new Date().getTime() - Number(startNanos) / 1_000_000;
  return durationMs / 1_000;
}

function TotalDuration() {
  const startupTimeNanos = useAtomValue(startupTimeAtom)?.startupTimeNanos;
  const [elapsedSeconds, setElapsedSeconds] = useState<number | undefined>(
    getDurationSeconds(startupTimeNanos),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(getDurationSeconds(startupTimeNanos));
    }, 1_000);
    return () => clearInterval(interval);
  }, [startupTimeNanos]);

  return (
    <Text>
      {elapsedSeconds == null ? "--" : formatDuration(elapsedSeconds)}
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
    <>
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
    </>
  );
}
