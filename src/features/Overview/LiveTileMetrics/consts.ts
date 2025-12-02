/** Tile regimes are the cartesian product of the following two state vectors:
    State vector 1:
    running: means that at the time the run loop executed, there was no upstream message I/O for the tile to handle.
    processing: means that at the time the run loop executed, there was one or more messages for the tile to consume.
    stalled: means that at the time the run loop executed, a downstream consumer of the messages produced by this tile is slow or stalled, and the message link for that consumer has filled up. This state causes the tile to stop processing upstream messages.
    
    State Vector 2:
    maintenance: the portion of the run loop that executes infrequent, potentially CPU heavy tasks
    routine: the portion of the run loop that executes regularly, regardless of the presence of incoming messages
    handling: the portion of the run loop that executes as a side effect of an incoming message from an upstream producer tile
 */
export const regimes = [
  "running_maintenance",
  "processing_maintenance",
  "stalled_maintenance",
  "running_routine",
  "processing_routine",
  "stalled_routine",
  "running_handling",
  "processing_handling",
  // "stalled_handling" is an impossible state, and is therefore excluded
];
