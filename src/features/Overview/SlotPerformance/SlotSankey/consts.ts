export const enum SlotNode {
  IncPackCranked = "Crank:inc",
  IncPackRetained = "Buffered:inc",
  IncResolvRetained = "Unresolved:inc",
  IncQuic = "QUIC",
  IncUdp = "UDP",
  IncGossip = "Gossip",
  IncBlockEngine = "Jito",

  SlotStart = "Received",
  SlotEnd = "Packed",
  End = "End",

  Networking = "networking:tile",
  QUIC = "QUIC:tile",
  Verification = "verify:tile",
  Dedup = "dedup:tile",
  Resolv = "resolv:tile",
  Pack = "pack:tile",
  Bank = "bank:tile",

  NetOverrun = "Too slow:net",
  QUICOverrun = "Too slow:quic",
  QUICInvalid = "Malformed:quic",
  QUICTooManyFrags = "Out of buffers:quic",
  QUICAbandoned = "Abandoned:quic",
  VerifyOverrun = "Too slow:verify",
  VerifyParse = "Unparseable",
  VerifyFailed = "Bad signature",
  VerifyDuplicate = "Duplicate:verify",
  DedupDeuplicate = "Duplicate:dedup",
  ResolvFailed = "Bad LUT",
  ResolvExpired = "Expired:resolv",
  ResolvNoLedger = "No ledger",
  ResolvRetained = "Unresolved:resolv",
  PackInvalid = "Unpackable",
  PackInvalidBundle = "Bad Bundle",
  PackExpired = "Expired:pack",
  PackRetained = "Buffered:pack",
  PackLeaderSlow = "Buffer full",
  PackWaitFull = "Storage full",
  BankInvalid = "Unexecutable",

  BlockSuccess = "Success",
  BlockFailure = "Failure",

  Votes = "Votes",
  NonVoteSuccess = "Non-vote Success",
  NonVoteFailure = "Non-vote Failure",
}

export const startEndNodes: SlotNode[] = [SlotNode.SlotStart, SlotNode.SlotEnd];

export const tileNodes: SlotNode[] = [
  SlotNode.Networking,
  SlotNode.QUIC,
  SlotNode.Verification,
  SlotNode.Dedup,
  SlotNode.Resolv,
  SlotNode.Pack,
  SlotNode.Bank,
];

export const droppedSlotNodes: SlotNode[] = [
  SlotNode.NetOverrun,
  SlotNode.QUICOverrun,
  SlotNode.QUICInvalid,
  SlotNode.QUICTooManyFrags,
  SlotNode.QUICAbandoned,
  SlotNode.VerifyOverrun,
  SlotNode.VerifyParse,
  SlotNode.VerifyFailed,
  SlotNode.VerifyDuplicate,
  SlotNode.DedupDeuplicate,
  SlotNode.ResolvFailed,
  SlotNode.ResolvExpired,
  SlotNode.ResolvNoLedger,
  SlotNode.ResolvRetained,
  SlotNode.PackInvalid,
  SlotNode.PackInvalidBundle,
  SlotNode.PackExpired,
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
  SlotNode.IncPackRetained,
  SlotNode.PackRetained,
  SlotNode.IncResolvRetained,
  SlotNode.ResolvRetained,
];

export const successfulSlotNodes: SlotNode[] = [
  SlotNode.BlockSuccess,
  SlotNode.NonVoteSuccess,
];

export const failedSlotNodes: SlotNode[] = [
  SlotNode.BlockFailure,
  SlotNode.NonVoteFailure,
];

export const slotNodes = [
  {
    id: SlotNode.IncQuic,
  },
  {
    id: SlotNode.IncUdp,
  },
  { id: SlotNode.PackRetained, labelPositionOverride: "right" },
  { id: SlotNode.ResolvRetained, labelPositionOverride: "right" },
  { id: SlotNode.NetOverrun, labelPositionOverride: "right" },
  { id: SlotNode.QUICOverrun, labelPositionOverride: "right" },
  { id: SlotNode.QUICInvalid, labelPositionOverride: "right" },
  { id: SlotNode.QUICTooManyFrags, labelPositionOverride: "right" },
  { id: SlotNode.QUICAbandoned, labelPositionOverride: "right" },
  { id: SlotNode.VerifyOverrun, labelPositionOverride: "right" },
  { id: SlotNode.VerifyParse, labelPositionOverride: "right" },
  { id: SlotNode.VerifyFailed, labelPositionOverride: "right" },
  { id: SlotNode.VerifyDuplicate, labelPositionOverride: "right" },
  { id: SlotNode.DedupDeuplicate, labelPositionOverride: "right" },
  { id: SlotNode.ResolvFailed, labelPositionOverride: "right" },
  { id: SlotNode.ResolvExpired, labelPositionOverride: "right" },
  { id: SlotNode.ResolvNoLedger, labelPositionOverride: "right" },
  { id: SlotNode.PackInvalid, labelPositionOverride: "right" },
  { id: SlotNode.PackInvalidBundle, labelPositionOverride: "right" },
  { id: SlotNode.PackExpired, labelPositionOverride: "right" },
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
    id: SlotNode.Resolv,
    alignLabelBottom: true,
  },
  {
    id: SlotNode.IncGossip,
  },
  {
    id: SlotNode.IncBlockEngine,
  },
  {
    id: SlotNode.IncResolvRetained,
    labelPositionOverride: "left",
  },
  {
    id: SlotNode.IncPackCranked,
    labelPositionOverride: "left",
  },
  {
    id: SlotNode.IncPackRetained,
    labelPositionOverride: "left",
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
  {
    id: SlotNode.Votes,
  },
  {
    id: SlotNode.NonVoteFailure,
  },
  {
    id: SlotNode.NonVoteSuccess,
  },
];
