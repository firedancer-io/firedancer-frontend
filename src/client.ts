import { ClientEnum } from "./api/entityEnums";

const envClient = (import.meta.env.VITE_VALIDATOR_CLIENT as string)?.trim();

export const client =
  envClient === ClientEnum.Firedancer || envClient === ClientEnum.Frankendancer
    ? envClient
    : ClientEnum.Frankendancer;

export const isFrankendancer = client === ClientEnum.Frankendancer;
export const isFiredancer = client === ClientEnum.Firedancer;
