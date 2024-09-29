export const enum SlotNode {
  IncRetained = "Retained:inc",
  IncQuic = "QUIC",
  IncUdp = "UDP",
  IncGossip = "Gossip",

  SlotStart = "Received",
  SlotEnd = "Packed",
  End = "End",

  Networking = "networking:tile",
  QUIC = "QUIC:tile",
  Verification = "verify:tile",
  Dedup = "dedup:tile",
  Pack = "pack:tile",
  Bank = "bank:tile",

  QUICOverrun = "Too slow:quic",
  QUICInvalid = "Malformed",
  VerifyOverrun = "Too slow:verify",
  VerifyParse = "Unparseable",
  VerifyFailed = "Bad signature",
  VerifyDuplicate = "Duplicate:verify",
  DedupDeuplicate = "Duplicate:dedup",
  PackInvalid = "Unpackable",
  PackRetained = "Retained:pack",
  PackLeaderSlow = "Execution too slow",
  PackWaitFull = "Storage full",
  BankInvalid = "Unexecutable",

  BlockSuccess = "Success",
  BlockFailure = "Failure",
}

export const startEndNodes: SlotNode[] = [SlotNode.SlotStart, SlotNode.SlotEnd];

export const tileNodes: SlotNode[] = [
  SlotNode.Networking,
  SlotNode.QUIC,
  SlotNode.Verification,
  SlotNode.Dedup,
  SlotNode.Pack,
  SlotNode.Bank,
];

export const droppedSlotNodes: SlotNode[] = [
  SlotNode.QUICOverrun,
  SlotNode.QUICInvalid,
  SlotNode.VerifyOverrun,
  SlotNode.VerifyParse,
  SlotNode.VerifyFailed,
  SlotNode.VerifyDuplicate,
  SlotNode.DedupDeuplicate,
  SlotNode.PackInvalid,
  SlotNode.PackRetained,
  SlotNode.PackLeaderSlow,
  SlotNode.PackWaitFull,
  SlotNode.BankInvalid,
];

export const incomingSlotNodes: SlotNode[] = [
  SlotNode.IncQuic,
  SlotNode.IncUdp,
];

export const retainedSlotNodes: SlotNode[] = [
  SlotNode.IncRetained,
  SlotNode.PackRetained,
];

export const slotNodes = [
  {
    id: SlotNode.IncQuic,
  },
  {
    id: SlotNode.IncUdp,
  },
  { id: SlotNode.PackRetained, labelPositionOverride: "right" },
  { id: SlotNode.QUICOverrun, labelPositionOverride: "right" },
  { id: SlotNode.QUICInvalid, labelPositionOverride: "right" },
  { id: SlotNode.VerifyOverrun, labelPositionOverride: "right" },
  { id: SlotNode.VerifyParse, labelPositionOverride: "right" },
  { id: SlotNode.VerifyFailed, labelPositionOverride: "right" },
  { id: SlotNode.VerifyDuplicate, labelPositionOverride: "right" },
  { id: SlotNode.DedupDeuplicate, labelPositionOverride: "right" },
  { id: SlotNode.PackInvalid, labelPositionOverride: "right" },
  { id: SlotNode.PackLeaderSlow, labelPositionOverride: "right" },
  { id: SlotNode.PackWaitFull, labelPositionOverride: "right" },
  { id: SlotNode.BankInvalid, labelPositionOverride: "right" },
  {
    id: SlotNode.SlotStart,
    alignLabelBottom: true,
    labelPositionOverride: "right",
  },
  {
    id: SlotNode.QUIC,
    alignLabelBottom: true,
  },
  {
    id: SlotNode.Verification,
    alignLabelBottom: true,
  },
  {
    id: SlotNode.Dedup,
    alignLabelBottom: true,
  },
  {
    id: SlotNode.IncGossip,
  },
  {
    id: SlotNode.IncRetained,
  },
  {
    id: SlotNode.Pack,
    alignLabelBottom: true,
  },
  {
    id: SlotNode.Bank,
    alignLabelBottom: true,
  },
  {
    id: SlotNode.End,
    hideLabel: true,
  },
  {
    id: SlotNode.SlotEnd,
    alignLabelBottom: true,
    labelPositionOverride: "left",
  },
  {
    id: SlotNode.BlockFailure,
  },
  {
    id: SlotNode.BlockSuccess,
  },
];
