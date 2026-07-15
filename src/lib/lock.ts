// Local-only lock: passcode hashed with PBKDF2, optional WebAuthn "biometric".
// Nothing leaves the device.
import { deleteSetting, getSetting, setSetting } from "./journal-db";

const PASSCODE_KEY = "lock.passcode";
const BIOMETRIC_KEY = "lock.biometric";
const RP_NAME = "Voice Journal";

interface PasscodeRecord {
  saltB64: string;
  hashB64: string;
  iterations: number;
}

interface BiometricRecord {
  credentialId: string; // base64url
}

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64url(buf: ArrayBuffer): string {
  return b64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function derive(
  passcode: string,
  salt: Uint8Array,
  iterations: number,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passcode),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, hash: "SHA-256", iterations },
    key,
    256,
  );
}

export async function hasPasscode(): Promise<boolean> {
  const rec = await getSetting<PasscodeRecord>(PASSCODE_KEY);
  return !!rec;
}

export async function setPasscode(passcode: string): Promise<void> {
  if (passcode.length < 4) throw new Error("Passcode must be at least 4 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 200_000;
  const hash = await derive(passcode, salt, iterations);
  const record: PasscodeRecord = {
    saltB64: b64(salt.buffer),
    hashB64: b64(hash),
    iterations,
  };
  await setSetting(PASSCODE_KEY, record);
}

export async function verifyPasscode(passcode: string): Promise<boolean> {
  const rec = await getSetting<PasscodeRecord>(PASSCODE_KEY);
  if (!rec) return false;
  const salt = new Uint8Array(fromB64url(rec.saltB64.replace(/\+/g, "-").replace(/\//g, "_")));
  // salt was b64 (not url); decode properly
  const rawSalt = Uint8Array.from(atob(rec.saltB64), (c) => c.charCodeAt(0));
  const hash = await derive(passcode, rawSalt, rec.iterations);
  const a = new Uint8Array(hash);
  const b = Uint8Array.from(atob(rec.hashB64), (c) => c.charCodeAt(0));
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  void salt;
  return diff === 0;
}

export async function removeLock(): Promise<void> {
  await deleteSetting(PASSCODE_KEY);
  await deleteSetting(BIOMETRIC_KEY);
}

export function isBiometricSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function"
  );
}

export async function isBiometricEnrolled(): Promise<boolean> {
  const rec = await getSetting<BiometricRecord>(BIOMETRIC_KEY);
  return !!rec;
}

export async function enrollBiometric(): Promise<void> {
  if (!isBiometricSupported()) throw new Error("Biometrics not supported on this device.");
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: RP_NAME, id: window.location.hostname },
      user: {
        id: userId,
        name: "voice-journal-user",
        displayName: "Voice Journal",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Biometric enrollment cancelled.");
  await setSetting<BiometricRecord>(BIOMETRIC_KEY, {
    credentialId: b64url(cred.rawId),
  });
}

export async function unlockWithBiometric(): Promise<boolean> {
  const rec = await getSetting<BiometricRecord>(BIOMETRIC_KEY);
  if (!rec) return false;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            id: fromB64url(rec.credentialId),
            type: "public-key",
          },
        ],
        userVerification: "required",
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    return !!assertion;
  } catch {
    return false;
  }
}

export async function disableBiometric(): Promise<void> {
  await deleteSetting(BIOMETRIC_KEY);
}
