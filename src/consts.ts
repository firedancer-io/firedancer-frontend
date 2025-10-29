export const slotsPerLeader = 4;
export const slotsListPinnedSlotOffset = 5;
export const scheduleUpcomingSlotsCount = 3;

export const solDecimals = 4;

export const lamportsPerSol = 1_000_000_000;

/** Max compute units is dynamic and pulled from the server,
 * this default should only be used as a fallback  */
export const defaultMaxComputeUnits = 60_000_000;

export const txnErrorCodeMap: Record<string, string> = {
  0: "Success", //	The transaction successfully executed
  1: "Account In Use", // Includes a writable account that was already in use at the time this transaction was executed
  2: "Account Loaded Twice", // Lists at least one account pubkey more than once
  3: "Account Not Found", // Lists at least one account pubkey that was not found in the accounts database
  4: "Program Account Not Found", // Could not find or parse a listed program account
  5: "Insufficient Funds For Fee", // Lists a fee payer that does not have enough SOL to fund this transaction
  6: "Invalid Account For Fee", // Lists a fee payer that may not be used to pay transaction fees
  7: "Already Processed", // This transaction has been processed before (e.g. the transaction was sent twice)
  8: "Blockhash Not Found", // Provides a block hash of a recent block in the chain, b, that this validator has not seen yet, or that is so old it has been discarded
  9: "Instruction Error", // Includes an instruction that failed to process
  10: "Call Chain Too Deep", // Includes a cross program invocation (CPI) chain that exceeds the maximum depth allowed
  11: "Missing Signature For Fee", // Requires a fee but has no signature present
  12: "Invalid Account Index", // Contains an invalid account reference in one of its instructions
  13: "Signature Failure", // Includes a signature that did not pass verification
  14: "Invalid Program For Execution", // Includes a program that may not be used for executing transactions
  15: "Sanitize Failure", // Failed to parse a portion of the transaction payload
  16: "Cluster Maintenance", // Cluster is undergoing an active maintenance window
  17: "Account Borrow Outstanding", // Transaction processing left an account with an outstanding borrowed reference
  18: "Would Exceed Max Block Cost Limit", // Exceeded the maximum compute unit cost allowed for this slot
  19: "Unsupported Version", // Includes a transaction version that is not supported by this validator
  20: "Invalid Writable Account", // Includes an account marked as writable that is not in fact writable
  21: "Would Exceed Max Account Cost Limit", // Exceeded the maximum per-account compute unit cost allowed for this slot
  22: "Would Exceed Account Data Block Limit", // Retrieved accounts data size exceeds the limit imposed for this slot
  23: "Too Many Account Locks", // Locked too many accounts
  24: "Address Lookup Table Not Found", // Loads an address table account that doesn't exist
  25: "Invalid Address Lookup Table Owner", // Loads an address table account with an invalid owner
  26: "Invalid Address Lookup Table Data", // Loads an address table account with invalid data
  27: "Invalid Address Lookup Table Index", // Address table lookup uses an invalid index
  28: "Invalid Rent Paying Account", // Deprecated
  29: "Would Exceed Max Vote Cost Limit", // Exceeded the maximum vote compute unit cost allowed for this slot
  30: "Would Exceed Account Data Total Limit", // Deprecated
  31: "Duplicate Instruction", // Contains duplicate instructions
  32: "Insufficient Funds For Rent", // Deprecated
  33: "Max Loaded Accounts Data Size Exceeded", // Retrieved accounts data size exceeds the limit imposed for this transaction
  34: "Invalid Loaded Accounts Data Size Limit", // Requested an invalid data size (i.e. 0)
  35: "Resanitization Needed", // Sanitized transaction differed before/after feature activation. Needs to be resanitized
  36: "Program Execution Temporarily Restricted", //	Execution of a program referenced by this transaciton is restricted
  37: "Unbalanced Transaction", //	The total accounts balance before the transaction does not equal the total balance after
  38: "Program Cache Hit Max Limit", //	The program cache allocated for transaction batch for this transaction hit its load limit
  39: "Commit Cancelled", //	This transaction was part of a bundle that failed
  40: "Bundle Peer", //	This transaction was part of a bundle that failed
};

export const nonBreakingSpace = "\u00A0";

export const clusterIndicatorHeight = 5;
export const slotNavHeight = 29;

export const headerHeight = 48;
export const headerSpacing = 13;
export const navToggleHeight = 21;
export const largeNavToggleHeight = 28;
export const slotsNavSpacing = 5;

export const logoWidth = 21;
export const logoRightSpacing = 8;
export const epochThumbPadding = logoRightSpacing;

export const slotsListWidth = 122;
export const slotNavWithoutListWidth = logoWidth + logoRightSpacing;
export const slotNavWidth =
  slotNavWithoutListWidth + slotsListWidth + slotsNavSpacing;

export const narrowNavMedia = "(max-width: 768px)";

export const maxZIndex = 110;

export const appMaxWidth = "1920px";
