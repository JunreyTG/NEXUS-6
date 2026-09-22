import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireUploadConfig } from "./config.js";

const generatedFilePattern = /^[0-9a-f-]{36}\.(csv|tsv|json|ndjson|jsonl|xml|xlsx)$/i;

export class TemporaryUploadStorage {
  private readonly directory: string;

  constructor(private readonly config = requireUploadConfig()) {
    this.directory = path.resolve(config.TEMP_UPLOAD_DIR ?? path.join(process.cwd(), "var", "uploads"));
  }

  getDirectory(): string {
    return this.directory;
  }

  createFilename(extension: string): string {
    return `${randomUUID()}.${extension}`;
  }

  resolve(filename: string): string {
    if (!generatedFilePattern.test(filename) || path.basename(filename) !== filename) throw new Error("Invalid temporary file key.");
    return path.join(this.directory, filename);
  }

  async ensureDirectory(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
  }

  async remove(filename: string | null | undefined): Promise<void> {
    if (!filename) return;
    await rm(this.resolve(filename), { force: true });
  }

  async cleanupExpired(): Promise<void> {
    await this.ensureDirectory();
    const cutoff = Date.now() - this.config.TEMP_UPLOAD_RETENTION_HOURS * 60 * 60 * 1000;
    for (const filename of await readdir(this.directory)) {
      if (!generatedFilePattern.test(filename)) continue;
      const file = await stat(this.resolve(filename)).catch(() => undefined);
      if (file && file.mtimeMs < cutoff) await this.remove(filename);
    }
  }
}
