import { Flex, Box, Text } from "@radix-ui/themes";
import CardHeader from "../../../components/CardHeader";
import Chart from "./Chart";
import Card from "../../../components/Card";
import styles from "./transactionsCard.module.css";
import TransactionStats from "./TransactionStats";


export default function TransactionsCard() {
  return (
    <Card style={{ flex: 1 }}>
      <Flex direction="column" height="100%" gap="2">
        <CardHeader text="Transactions" />
        <Flex gap="4" flexGrow="1">
          <TransactionStats />
          <Flex direction="column" flexGrow="1">
            <Box flexGrow="1" minWidth="180px">
              <Chart />
            </Box>
            <Flex justify="between">
              <Text className={styles.axisText}>~ 1min ago</Text>
              <Text className={styles.axisText}>Now</Text>
            </Flex>
          </Flex>
        </Flex>
      </Flex>
    </Card>
  );
}
