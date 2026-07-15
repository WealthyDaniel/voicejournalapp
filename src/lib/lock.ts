// Local-only lock: passcode hashed with PBKDF2, optional WebAuthn "biometric".
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

function bufferToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function bufferToB64Url(buf: ArrayBuffer): string {
  return bufferToB64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64ToBuffer(s: string): ArrayBuffer {
  const bin = atob(s);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}
function b64UrlToBuffer(s: string): ArrayBuffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return b64ToBuffer(s);
}
function randomBuffer(size: number): ArrayBuffer {
  const buf = new ArrayBuffer(size);
  crypto.getRandomValues(new Uint8Array(buf));
  return buf;
}

async function derive(
  passcode: string,
  salt: ArrayBuffer,
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
  const salt = randomBuffer(16);
  const iterations = 200_000;
  const hash = await derive(passcode, salt, iterations);
  await setSetting<PasscodeRecord>(PASSCODE_KEY, {
    saltB64: bufferToB64(salt),
    hashB64: bufferToB64(hash),
    iterations,
  });
}

export async function verifyPasscode(passcode: string): Promise<boolean> {
  const rec = await getSetting<PasscodeRecord>(PASSCODE_KEY);
  if (!rec) return false;
  const salt = b64ToBuffer(rec.saltB64);
  const hash = await derive(passcode, salt, rec.iterations);
  const a = new Uint8Array(hash);
  const b = new Uint8Array(b64ToBuffer(rec.hashB64));
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
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
  const challenge = new Uint8Array(randomBuffer(32));
  const userId = new Uint8Array(randomBuffer(16));
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
    credentialId: bufferToB64Url(cred.rawId),
  });
}

export async function unlockWithBiometric(): Promise<boolean> {
  const rec = await getSetting<BiometricRecord>(BIOMETRIC_KEY);
  if (!rec) return false;
  const challenge = new Uint8Array(randomBuffer(32));
  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            id: new Uint8Array(b64UrlToBuffer(rec.credentialId)),
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
