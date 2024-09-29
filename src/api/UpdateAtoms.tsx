import useUpdateTransactions from "../features/Overview/TransactionsCard/useUpdateTransactions";
import usePingPong from "../hooks/usePing";
import { useSetAtomWsData } from "./useSetAtomWsData";

export default function UpdateAtoms() {
  useSetAtomWsData();
  useUpdateTransactions();
  usePingPong();

  return null;
}
