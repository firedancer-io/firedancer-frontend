import { DateTime } from "luxon";

export interface LeaderScheduleSlot {
  name: string;
  voteKey: string;
  slotHeight: number;
  slotStart?: DateTime;
  slotEnd?: DateTime;
  // stakePct: number;
  // block?: string;
  // isBlockConfirmed?: boolean;
  transactionCount?: number;
  instructionCount?: number;
  //   fees?: number;
  rewards?: number;
  missed?: boolean;
  // solMoved?: number;
}
