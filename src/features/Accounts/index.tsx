import { Flex } from "@radix-ui/themes";
import styles from "./accounts.module.css";
import DiskCard from "./DiskCard";
import IndexCard from "./IndexCard";

export default function Accounts() {
  return (
    <Flex direction="column">
      <Flex className={styles.cards} width="100%" wrap="wrap" gap="5px">
        <DiskCard />
        <IndexCard />
      </Flex>
    </Flex>
  );
}
