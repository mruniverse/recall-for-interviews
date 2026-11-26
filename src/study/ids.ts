let counter = 0;

/**
 * One ID per presented prompt; retries of that prompt reuse it.
 * @returns A UUID when the runtime provides `crypto.randomUUID`, otherwise time, a process counter
 *   and 96 random bits (Hermes ships no WebCrypto by default).
 */
export function newAttemptId(): string {
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
  counter = (counter + 1) % 0x10000;
  const random = () => Math.floor(Math.random() * 0x1_0000_0000).toString(16).padStart(8, '0');
  return `${Date.now().toString(36)}-${counter.toString(36)}-${random()}${random()}${random()}`;
}
