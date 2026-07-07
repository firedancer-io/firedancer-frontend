export enum PartitionTier {
  Hot = 0,
  Warm = 1,
  Cold = 2,
  Off = 255,
}

export const partitionTierLabel: Record<number, string> = {
  [PartitionTier.Hot]: "Hot",
  [PartitionTier.Warm]: "Warm",
  [PartitionTier.Cold]: "Cold",
  [PartitionTier.Off]: "Off",
};

export const partitionTierColor: Record<number, string> = {
  [PartitionTier.Hot]: "var(--red-9)",
  [PartitionTier.Warm]: "var(--orange-9)",
  [PartitionTier.Cold]: "var(--blue-8)",
  [PartitionTier.Off]: "var(--gray-7)",
};

export const cacheClassList = [
  { label: "128 B", bytes: 128 },
  { label: "512 B", bytes: 512 },
  { label: "2 KiB", bytes: 2_048 },
  { label: "8 KiB", bytes: 8_192 },
  { label: "32 KiB", bytes: 32_768 },
  { label: "128 KiB", bytes: 131_072 },
  { label: "1 MiB", bytes: 1_048_576 },
  { label: "10 MiB", bytes: 10_485_760 },
];

export const cacheClassColors = [
  "var(--indigo-8)",
  "var(--blue-8)",
  "var(--cyan-8)",
  "var(--teal-8)",
  "var(--lime-8)",
  "var(--yellow-8)",
  "var(--brown-8)",
  "var(--red-8)",
];

export const cacheClassUnusedColors = [
  "var(--indigo-3)",
  "var(--blue-3)",
  "var(--cyan-3)",
  "var(--teal-3)",
  "var(--lime-3)",
  "var(--yellow-3)",
  "var(--brown-3)",
  "var(--red-3)",
];
