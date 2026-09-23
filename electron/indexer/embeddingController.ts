import { Worker } from "node:worker_threads";
import path from "node:path";
import type { EmbedStatus } from "../../shared/types";

export type { EmbedStatus };

/**
 * Owns the worker thread that embeds image/video files under a root with
 * CLIP. Deliberately separate from IndexerController (walker.worker.ts):
 * the metadata walk is fast and should finish quickly, while embedding is
 * CPU/GPU-heavy model inference — keeping them as different workers means a
 * slow embedding pass never blocks basic keyword search from becoming
 * available.
 */
export class EmbeddingController {
  private worker: Worker | null = null;
  private status: EmbedStatus = { state: "idle", processed: 0, total: 0 };
  private onUpdate: (status: EmbedStatus) => void;

  constructor(onUpdate: (status: EmbedStatus) => void) {
    this.onUpdate = onUpdate;
  }

  start(rootPath: string, dbPath: string, modelCacheDir: string): void {
    this.cancel();
    this.status = { state: "embedding", rootPath, processed: 0, total: 0 };
    this.onUpdate(this.status);

    this.worker = new Worker(path.join(__dirname, "indexer", "embed.worker.cjs"), {
      workerData: { rootPath, dbPath, modelCacheDir },
    });

    this.worker.on(
      "message",
      (msg: { type: string; processed?: number; total?: number; currentPath?: string; message?: string }) => {
        if (msg.type === "progress") {
          this.status = {
            ...this.status,
            processed: msg.processed ?? this.status.processed,
            total: msg.total ?? this.status.total,
            currentPath: msg.currentPath,
          };
        } else if (msg.type === "done") {
          this.status = { ...this.status, state: "done", processed: msg.processed ?? this.status.processed };
        } else if (msg.type === "error") {
          this.status = { ...this.status, state: "error", error: msg.message };
        }
        this.onUpdate(this.status);
      }
    );

    this.worker.on("error", (err) => {
      this.status = { ...this.status, state: "error", error: err.message };
      this.onUpdate(this.status);
    });
  }

  cancel(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  getStatus(): EmbedStatus {
    return this.status;
  }
}
