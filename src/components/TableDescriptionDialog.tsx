import { Button, Dialog, Flex, Table, Tooltip } from "@radix-ui/themes";
import styles from "./tableDescriptionDialog.module.css";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { appMaxWidth } from "../consts";
import type { ColumnGroup } from "./DataTable";

interface TableDescriptionDialogProps {
  groups: ColumnGroup[];
}

export default function TableDescriptionDialog({
  groups,
}: TableDescriptionDialogProps) {
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
        <Dialog.Title size="2" mb="0px">
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
            {groups.map((group) =>
              group.columns.map((column) => (
                <Table.Row key={column.uniqueName} className={styles.tr}>
                  <Table.Cell className={styles.name}>
                    {column.uniqueName}
                  </Table.Cell>
                  <Table.Cell>{column.description}</Table.Cell>
                </Table.Row>
              )),
            )}
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
