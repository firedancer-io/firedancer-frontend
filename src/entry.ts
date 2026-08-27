/* Pipelined entry: fire all three stage imports at once so each chunk
   evaluates as its bytes land (react -> vendor -> app) instead of after
   the last byte of one monolithic entry. */
void import("./pipeline/reactLibs").catch(() => {});
void import("./pipeline/vendorLibs").catch(() => {});
void import("./main");
