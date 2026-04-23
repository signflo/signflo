import "server-only";
import type { Storage } from "./index";
import { LocalStorage } from "./local";

let _storage: Storage | null = null;

export function getStorage(): Storage {
  if (_storage) return _storage;
  _storage = new LocalStorage();
  return _storage;
}
