import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

type VaultPayload = {
  schemaVersion: 1;
  values: Record<string, string>;
};

export class DesktopCredentialVault {
  // The desktop single-instance lock owns this file. Serialize all operations
  // within its vault so a read cannot race an in-flight read/modify/write.
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly safeStorage: SafeStorageAdapter,
  ) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async write(payload: VaultPayload): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(`${JSON.stringify(payload, null, 2)}\n`, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      // Replace a complete, flushed file; never truncate the current vault.
      await rename(temporary, this.path);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private assertAvailable() {
    if (!this.safeStorage.isEncryptionAvailable()) {
      const error = new Error("OS secure storage is unavailable");
      Object.assign(error, { code: "DESKTOP_SECURE_STORAGE_UNAVAILABLE" });
      throw error;
    }
  }

  private async read(): Promise<VaultPayload> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as VaultPayload;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { schemaVersion: 1, values: {} };
      }
      throw error;
    }
  }

  get(name: string): Promise<string | null> {
    return this.serialize(async () => {
      const encrypted = (await this.read()).values[name];
      if (!encrypted) return null;
      // Even an availability check can access Keychain and show system UI.
      // A missing file/value must not request access to an unrelated old key.
      this.assertAvailable();
      return this.safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    });
  }

  set(name: string, value: string): Promise<void> {
    return this.setMany({ [name]: value });
  }

  setMany(values: Record<string, string>): Promise<void> {
    return this.serialize(async () => {
      if (Object.keys(values).length === 0) return;
      this.assertAvailable();
      const payload = await this.read();
      for (const [name, value] of Object.entries(values)) {
        payload.values[name] = this.safeStorage
          .encryptString(value)
          .toString("base64");
      }
      await this.write(payload);
    });
  }

  delete(name: string): Promise<void> {
    return this.serialize(async () => {
      const payload = await this.read();
      if (!Object.hasOwn(payload.values, name)) return;
      delete payload.values[name];
      await this.write(payload);
    });
  }
}
