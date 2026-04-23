import "server-only";
import { mkdir, readFile, writeFile, stat, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Storage, PutResult } from "./index";

export class LocalStorage implements Storage {
  private root: string;

  constructor(root?: string) {
    this.root = resolve(process.cwd(), root ?? process.env.UPLOADS_DIR ?? "./uploads");
  }

  private pathFor(key: string): string {
    const safe = key.replace(/^\/+/, "").replace(/\.\./g, "");
    return join(this.root, safe);
  }

  async put(key: string, data: Buffer | Uint8Array): Promise<PutResult> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await writeFile(path, buf);
    return { key, path, size: buf.length };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.pathFor(key));
    } catch {}
  }

  url(key: string): string {
    return `/api/storage/${encodeURIComponent(key)}`;
  }
}
