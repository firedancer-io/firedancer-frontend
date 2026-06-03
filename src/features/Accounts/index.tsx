import { Flex } from "@radix-ui/themes";
import DiskCard from "./DiskCard";
import styles from "./accounts.module.css";

export default function Accounts() {
  return (
    <Flex direction="column">
      <Flex className={styles.cards} width="100%" wrap="wrap" gap="5px">
        <DiskCard />
      </Flex>
    </Flex>
  );
}
