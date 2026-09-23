import { Worker } from "node:worker_threads";
import path from "node:path";
import type { IndexStatus } from "../../shared/types";

export type { IndexStatus };

/**
 * Owns the worker thread that performs a full (initial or re-triggered) scan
 * of an indexed root. One scan runs at a time; starting a new one cancels
 * whatever was in flight.
 */
export class IndexerController {
  private worker: Worker | null = null;
  private status: IndexStatus = { state: "idle", processed: 0 };
  private onUpdate: (status: IndexStatus) => void;

  constructor(onUpdate: (status: IndexStatus) => void) {
    this.onUpdate = onUpdate;
  }

  start(rootPath: string, dbPath: string): void {
    this.cancel();
    this.status = { state: "scanning", rootPath, processed: 0 };
    this.onUpdate(this.status);

    // This module is bundled into dist-electron/main.cjs, so __dirname at
    // runtime is dist-electron/ — but walker.worker.ts is its own esbuild
    // entry point and lands at dist-electron/indexer/walker.worker.cjs.
    this.worker = new Worker(path.join(__dirname, "indexer", "walker.worker.cjs"), {
      workerData: { rootPath, dbPath },
    });

    this.worker.on("message", (msg: { type: string; processed?: number; currentPath?: string; message?: string }) => {
      if (msg.type === "progress") {
        this.status = { ...this.status, processed: msg.processed ?? this.status.processed, currentPath: msg.currentPath };
      } else if (msg.type === "done") {
        this.status = { ...this.status, state: "done", processed: msg.processed ?? this.status.processed };
      } else if (msg.type === "error") {
        this.status = { ...this.status, state: "error", error: msg.message };
      }
      this.onUpdate(this.status);
    });

    this.worker.on("error", (err) => {
      this.status = { ...this.status, state: "error", error: err.message };
      this.onUpdate(this.status);
    });
  }

  cancel(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  getStatus(): IndexStatus {
    return this.status;
  }
}
