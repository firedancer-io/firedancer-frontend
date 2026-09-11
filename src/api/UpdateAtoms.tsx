import usePingPong from "../hooks/usePing";
import { useSetAtomWsData } from "./useSetAtomWsData";

export default function UpdateAtoms() {
  useSetAtomWsData();
  usePingPong();

  return null;
}
