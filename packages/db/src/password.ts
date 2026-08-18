import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing on top of Node's built-in scrypt — a real memory-hard KDF,
 * so no dependency is needed for this.
 *
 * Stored format: `scrypt$N$r$p$saltBase64$hashBase64`. Keeping the parameters
 * inside the string means they can be raised later without invalidating hashes
 * that were written with the old cost.
 */
const N = 2 ** 15; // CPU/memory cost
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAXMEM });
  return ["scrypt", N, R, P, salt.toString("base64"), derived.toString("base64")].join("$");
}

/**
 * Constant-time verification. Returns false rather than throwing on a malformed
 * stored value, so a corrupt row denies access instead of crashing login.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const cost = Number(rawN);
  const blockSize = Number(rawR);
  const parallelism = Number(rawP);
  if (!cost || !blockSize || !parallelism || !rawSalt || !rawHash) return false;

  const expected = Buffer.from(rawHash, "base64");

  let derived: Buffer;
  try {
    derived = await scrypt(password, Buffer.from(rawSalt, "base64"), expected.length, {
      N: cost,
      r: blockSize,
      p: parallelism,
      maxmem: MAXMEM,
    });
  } catch {
    return false;
  }

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * Compared against when no account matches, so a missing account costs roughly
 * the same time as a wrong password and cannot be told apart from outside.
 */
export const DUMMY_PASSWORD_HASH = await hashPassword(randomBytes(32).toString("hex"));
