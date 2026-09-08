import { CircleIcon, RadiobuttonIcon } from "@radix-ui/react-icons";
import tableStyles from "../../../components/dataTable.module.css";
import { Flex } from "@radix-ui/themes";

export function SelectTileToggle() {
  return (
    <Flex align="center" className={tableStyles.selectToggle}>
      <CircleIcon className={tableStyles.selectIcon} />
      <RadiobuttonIcon className={tableStyles.selectedIcon} />
    </Flex>
  );
}
