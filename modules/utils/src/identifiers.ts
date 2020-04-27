import { Address, AssetId, PublicKey, PublicIdentifier } from "@connext/types";
import bs58check from "bs58check";
import { utils } from "ethers";
import { hexToBuffer, bufferToHex, compress, decompress, isCompressed } from "eccrypto-js";

import { getAddressError } from "./hexStrings";
import { getAddressFromPublicKey } from "./crypto";

export const INDRA_PUB_ID_PREFIX = "indra";

////////////////////////////////////////
// Conversions

export const getPublicIdentifierFromPublicKey = (publicKey: PublicKey): PublicIdentifier => {
  const buf = hexToBuffer(publicKey);
  // TODO: compress util should return same result even if already compressed
  return INDRA_PUB_ID_PREFIX + bs58check.encode(isCompressed(buf) ? buf : compress(buf));
};

export const getPublicKeyFromPublicIdentifier = (publicIdentifier: PublicIdentifier) =>
  `0x${bufferToHex(
    decompress(bs58check.decode(publicIdentifier.replace(INDRA_PUB_ID_PREFIX, ""))),
  )}`;

export const getSignerAddressFromPublicIdentifier = (publicIdentifier: PublicIdentifier): Address =>
  getAddressFromPublicKey(getPublicKeyFromPublicIdentifier(publicIdentifier));

// makes sure all addresses are normalized
export const getAddressFromAssetId = (assetId: AssetId): Address => utils.getAddress(assetId);

////////////////////////////////////////
// Validators

export const getPublicIdentifierError = (value: any): string | undefined => {
  try {
    if (typeof value !== "string") {
      return `Invalid public identifier. Expected a string, got ${typeof value}`;
    } else if (!value.startsWith(INDRA_PUB_ID_PREFIX)) {
      return `Invalid public identifier. Expected ${value} to start with ${INDRA_PUB_ID_PREFIX}`;
    }
    const addressError = getAddressError(getSignerAddressFromPublicIdentifier(value));
    return addressError
      ? `Invalid public identifier. Got errors recovering address from ${value}: ${addressError}`
      : undefined;
  } catch (e) {
    return e.message;
  }
};
export const isValidPublicIdentifier = (value: any): boolean => !getPublicIdentifierError(value);
