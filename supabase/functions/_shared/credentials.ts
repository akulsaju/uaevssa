const encoder = new TextEncoder();

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function encryptionKey(): Promise<CryptoKey> {
  const configured = Deno.env.get("BOUNDARY_CREDENTIAL_ENCRYPTION_KEY");
  if (!configured) {
    throw new Error("Credential encryption is not configured on the server.");
  }
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(configured);
  } catch {
    throw new Error("Credential encryption key must be base64-encoded.");
  }
  if (bytes.length !== 32) {
    throw new Error("Credential encryption key must contain 32 bytes.");
  }
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(bytes),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptCredentials(
  value: Record<string, string>,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    plaintext,
  );
  return `v1.${encodeBase64(iv)}.${encodeBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptCredentials(
  value: string,
): Promise<Record<string, string>> {
  const [version, encodedIv, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext) {
    throw new Error("Stored cloud credentials have an unsupported format.");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(decodeBase64(encodedIv)) },
    await encryptionKey(),
    toArrayBuffer(decodeBase64(encodedCiphertext)),
  );
  const decoded: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("Stored cloud credentials are invalid.");
  }
  return decoded as Record<string, string>;
}
