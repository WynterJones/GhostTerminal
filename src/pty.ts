import { Channel, invoke } from "@tauri-apps/api/core";

function toBytes(msg: unknown): Uint8Array {
  if (msg instanceof ArrayBuffer) return new Uint8Array(msg);
  if (msg instanceof Uint8Array) return msg;
  if (Array.isArray(msg)) return new Uint8Array(msg);
  return new TextEncoder().encode(String(msg));
}

export async function spawnPty(
  id: number,
  cols: number,
  rows: number,
  onData: (bytes: Uint8Array) => void,
): Promise<void> {
  const ch = new Channel<unknown>();
  ch.onmessage = (msg) => onData(toBytes(msg));
  await invoke("spawn_pty", { id, cols, rows, onData: ch });
}

export function writePty(id: number, data: string): void {
  void invoke("write_pty", { id, data });
}

export function resizePty(id: number, cols: number, rows: number): void {
  void invoke("resize_pty", { id, cols, rows });
}

export function killPty(id: number): void {
  void invoke("kill_pty", { id });
}
