import { Flex } from "@radix-ui/themes";
import { startupProgressAtom } from "../../api/atoms";
import { useAtomValue } from "jotai";
import ValueDisplay from "./ValueDisplay";

export default function LoadingLedgerProgress() {
  const startupProgress = useAtomValue(startupProgressAtom);

  if (!startupProgress) return null;

  return (
    <Flex>
      <ValueDisplay label="Current Slot" value={startupProgress.ledger_slot} />
      <ValueDisplay label="Max Slot" value={startupProgress.ledger_max_slot} />
    </Flex>
  );
}
