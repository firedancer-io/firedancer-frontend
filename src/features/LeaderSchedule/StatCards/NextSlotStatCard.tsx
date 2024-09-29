import { Progress } from "@radix-ui/themes";
import StatCard from "./StatCard";
import styles from "./nextSlot.module.css";
import useNextSlot from "../../../hooks/useNextSlot";

export default function NextSlotStatCard() {
  const { progressSinceLastLeader, nextSlotText } = useNextSlot();

  return (
    <StatCard
      headerText="Next leader slot"
      primaryText={nextSlotText}
      primaryTextColor="#BDF3FF"
    >
      <Progress
        value={progressSinceLastLeader}
        size="3"
        className={styles.progress}
      />
    </StatCard>
  );
}
