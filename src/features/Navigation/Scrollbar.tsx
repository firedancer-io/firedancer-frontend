import { useCallback } from "react";
import { Box, Button, Flex } from "@radix-ui/themes";
import { CaretDownIcon, CaretUpIcon } from "@radix-ui/react-icons";
import EpochBar from "./EpochBar";
import useNavigateLeaderSlot from "../../hooks/useNavigateLeaderSlot";

export type ScrollbarStyles = {
  barHeight: number;
  slotWidth: number;
  slotHeight: number;
  slotHeightRendered: number;
  slotsPerPixel: number;
  iconSize: number;
  paddingLeft: number;
};

export default function Scrollbar() {
  return (
    <Flex
      direction="column"
      gap="1"
      height="100%"
      mb="2"
      align="start"
      width="30px"
      justify="center"
    >
      <ScrollButton isScrollUp />
      <Box width="100%" height="100%">
        <EpochBar />
      </Box>
      <ScrollButton />
    </Flex>
  );
}

function ScrollButton({ isScrollUp = false }: { isScrollUp?: boolean }) {
  const { navPrevLeaderSlot, navNextLeaderSlot } = useNavigateLeaderSlot();
  const onClick = useCallback(
    () => (isScrollUp ? navNextLeaderSlot() : navPrevLeaderSlot()),
    [isScrollUp, navNextLeaderSlot, navPrevLeaderSlot],
  );

  return (
    <Button color="gray" variant="soft" onClick={onClick} asChild>
      <Box width="100%" height="13px" p="0" flexGrow="0" flexShrink="0">
        {isScrollUp ? <CaretUpIcon /> : <CaretDownIcon />}
      </Box>
    </Button>
  );
}
