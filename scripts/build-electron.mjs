import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: [
    "electron/main.ts",
    "electron/preload.ts",
    "electron/indexer/walker.worker.ts",
    "electron/indexer/embed.worker.ts",
  ],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  // Native modules (and packages with dynamic/optional requires) can't be
  // bundled by esbuild — they stay real `require()` calls resolved against
  // node_modules at runtime, same as any other Node dependency.
  external: [
    "electron",
    "better-sqlite3",
    "exifr",
    "sqlite-vec",
    "sharp",
    "onnxruntime-node",
    "ffmpeg-static",
    "@huggingface/transformers",
    "@anthropic-ai/sdk",
  ],
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("[build-electron] watching for changes...");
} else {
  await esbuild.build(options);
}
