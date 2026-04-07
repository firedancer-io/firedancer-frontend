import { ClientEnum, clientSchema } from "./api/entities";

const parsedClient = clientSchema.safeParse(
  (import.meta.env.VITE_VALIDATOR_CLIENT as string)?.trim(),
);

export const client = parsedClient.error
  ? ClientEnum.Frankendancer
  : parsedClient.data;

export const isFrankendancer = client === ClientEnum.Frankendancer;
export const isFiredancer = client === ClientEnum.Firedancer;
