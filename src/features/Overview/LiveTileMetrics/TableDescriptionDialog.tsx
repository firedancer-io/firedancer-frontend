import { Button, Dialog, Flex, Table, Tooltip } from "@radix-ui/themes";
import styles from "./tableDescriptionDialog.module.css";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { metrics } from "./consts";
import { appMaxWidth } from "../../../consts";

export default function TableDescriptionDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger>
        <Flex>
          <Tooltip content="Click to view column definitions.">
            <InfoCircledIcon color="var(--gray-11)" cursor="pointer" />
          </Tooltip>
        </Flex>
      </Dialog.Trigger>

      <Dialog.Content
        maxHeight="85dvh"
        maxWidth={`min(80dvw, calc(0.8 * ${appMaxWidth}))`}
        size="1"
        className={styles.tableDescriptionDialog}
      >
        <Dialog.Title size="2" className={styles.title} mb="0px">
          Column Definitions
        </Dialog.Title>
        <Table.Root size="1" className={styles.table}>
          <colgroup>
            <col style={{ width: "110px" }} />
          </colgroup>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell className={styles.th}>
                Column
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell className={styles.th}>
                Definition
              </Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>

          <Table.Body>
            {metrics.map((metric) => (
              <Table.Row key={metric.name} className={styles.tr}>
                <Table.Cell className={styles.name}>{metric.name}</Table.Cell>
                <Table.Cell>{metric.description}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>

        <Flex justify="end">
          <Dialog.Close>
            <Button className={styles.closeButton}>Close</Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
