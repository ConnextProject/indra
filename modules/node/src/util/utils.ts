import { getLowerCaseAddress } from "@connext/crypto";

import { isEthAddress } from "./validate";

export const normalizeEthAddresses = (obj: any): any => {
  const res = {};
  Object.entries(obj).forEach(([key, value]: any): any => {
    if (isEthAddress(value as string)) {
      res[key] = getLowerCaseAddress(value as any);
      return;
    }
    res[key] = value;
    return;
  });
  return res;
};

export const safeJsonParse = (value: any): any => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};
