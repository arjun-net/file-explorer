import { safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * The Anthropic API key never round-trips back to the renderer once set —
 * IPC only exposes "is a key configured" (setApiKey/clearApiKey/hasApiKey),
 * not the key value itself, so it's not sitting in devtools or renderer
 * memory. On disk it's encrypted via Electron's safeStorage, which is
 * backed by the OS keychain (Keychain on macOS, DPAPI on Windows, libsecret
 * on Linux) — the encrypted blob is useless without the same OS user
 * account that wrote it.
 */
export class SettingsStore {
  private filePath: string;

  constructor(userDataDir: string) {
    this.filePath = path.join(userDataDir, "secrets.enc");
  }

  setApiKey(key: string): void {
    const trimmed = key.trim();
    if (!trimmed) {
      this.clearApiKey();
      return;
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Secure storage isn't available on this system.");
    }
    fs.writeFileSync(this.filePath, safeStorage.encryptString(trimmed));
  }

  getApiKey(): string | null {
    if (!fs.existsSync(this.filePath)) return null;
    try {
      const buf = fs.readFileSync(this.filePath);
      return safeStorage.decryptString(buf);
    } catch {
      return null;
    }
  }

  hasApiKey(): boolean {
    return this.getApiKey() !== null;
  }

  clearApiKey(): void {
    if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
  }
}
