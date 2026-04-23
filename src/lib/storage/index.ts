export interface PutResult {
  key: string;
  path: string;
  size: number;
}

export interface Storage {
  put(key: string, data: Buffer | Uint8Array): Promise<PutResult>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  url(key: string): string;
}

export { LocalStorage } from "./local";
export { getStorage } from "./factory";
