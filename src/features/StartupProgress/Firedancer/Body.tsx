import { useAtomValue, useSetAtom } from "jotai";
import { bootProgressAtom } from "../../../api/atoms";
import styles from "./body.module.css";
import { useEffect } from "react";
import {
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

const classNames: { [phase in BootPhase]?: string } = {
  [BootPhaseEnum.joining_gossip]: styles.gossip,
  [BootPhaseEnum.loading_full_snapshot]: styles.fullSnapshot,
  [BootPhaseEnum.loading_incr_snapshot]: styles.incrSnapshot,
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
  const step = steps[phase];

  return (
    <Container
      ref={(el: HTMLDivElement) => setBootProgressContainerEl(el)}
      maxWidth={appMaxWidth}
      className={clsx(styles.container, phaseClass, {
        [styles.collapsed]: !showStartupProgress || !isStartupProgressExpanded,
      })}
      p="4"
    >
      <Header />
      <Flex justify="between" mt="4" mb="20px" className={styles.stepContainer}>
        <span>
          <Text className={styles.secondaryText}>Elapsed</Text>{" "}
          <TotalDuration />
        </span>
        <Text className={styles.stepName}>{step.name}</Text>
        <span>
          <Text>79% </Text>
          <Text className={styles.secondaryText}>Complete</Text>
        </span>
      </Flex>

      <ProgressBar stepIndex={step.index} />

      <Box pt="6" flexGrow="1">
        {phase === BootPhaseEnum.joining_gossip && <GossipProgress />}
        {(phase === BootPhaseEnum.loading_full_snapshot ||
          phase === BootPhaseEnum.loading_incr_snapshot) && (
          <SnapshotProgress />
        )}
      </Box>
    </Container>
  );
}

function TotalDuration() {
  const totalElapsed = useAtomValue(bootProgressAtom)?.total_elapsed;
  const duration = totalElapsed == null ? "--" : formatDuration(totalElapsed);
  return <Text>{duration}</Text>;
}
