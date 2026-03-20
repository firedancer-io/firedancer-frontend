import useUpdateTransactions from "../features/Overview/TransactionsCard/useUpdateTransactions";
import usePingPong from "../hooks/usePing";
import { useSetAtomWs } from "./ws/useSetAtomWs";

export default function UpdateAtoms() {
  useSetAtomWs();
  useUpdateTransactions();
  usePingPong();

  return null;
}
