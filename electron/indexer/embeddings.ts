/**
 * CLIP (ViT-B/32) embeddings via @huggingface/transformers, running fully
 * locally through onnxruntime-node — no network calls except the one-time
 * model download on first use (cached under `cacheDir`, ~160MB).
 *
 * Both images and text queries land in the same 512-dim embedding space, so
 * a text query like "white goose" can be compared directly against image/
 * video-frame embeddings without either side needing to name the other.
 * Vectors are L2-normalized before being returned, so plain Euclidean
 * distance in that space (what sqlite-vec's vec0 table uses by default)
 * ranks results the same as cosine similarity would.
 */
import {
  env,
  AutoTokenizer,
  AutoProcessor,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
  type PreTrainedTokenizer,
  type Processor,
} from "@huggingface/transformers";

const MODEL_ID = "Xenova/clip-vit-base-patch32";
export const EMBEDDING_DIM = 512;

let configured = false;
export function configureModelCache(cacheDir: string): void {
  if (configured) return;
  env.cacheDir = cacheDir;
  env.backends.onnx.logLevel = "error";
  configured = true;
}

interface TextPipeline {
  tokenizer: PreTrainedTokenizer;
  model: Awaited<ReturnType<typeof CLIPTextModelWithProjection.from_pretrained>>;
}
interface VisionPipeline {
  processor: Processor;
  model: Awaited<ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained>>;
}

let textPipelinePromise: Promise<TextPipeline> | null = null;
let visionPipelinePromise: Promise<VisionPipeline> | null = null;

function getTextPipeline(): Promise<TextPipeline> {
  if (!textPipelinePromise) {
    textPipelinePromise = (async () => {
      const [tokenizer, model] = await Promise.all([
        AutoTokenizer.from_pretrained(MODEL_ID),
        CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { dtype: "q8" }),
      ]);
      return { tokenizer, model };
    })();
  }
  return textPipelinePromise;
}

function getVisionPipeline(): Promise<VisionPipeline> {
  if (!visionPipelinePromise) {
    visionPipelinePromise = (async () => {
      const [processor, model] = await Promise.all([
        AutoProcessor.from_pretrained(MODEL_ID),
        CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: "q8" }),
      ]);
      return { processor, model };
    })();
  }
  return visionPipelinePromise;
}

function l2Normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

export async function embedText(query: string): Promise<Float32Array> {
  const { tokenizer, model } = await getTextPipeline();
  const inputs = tokenizer([query], { padding: true, truncation: true });
  const { text_embeds } = await model(inputs);
  return l2Normalize(Float32Array.from(text_embeds.data as Float32Array));
}

export async function embedImageFile(filePath: string): Promise<Float32Array> {
  const { processor, model } = await getVisionPipeline();
  const image = await RawImage.read(filePath);
  const inputs = await processor(image);
  const { image_embeds } = await model(inputs);
  return l2Normalize(Float32Array.from(image_embeds.data as Float32Array));
}

/** Batched form used by the video keyframe pipeline — one processor/model call for N frames. */
export async function embedImageFiles(filePaths: string[]): Promise<Float32Array[]> {
  if (filePaths.length === 0) return [];
  const { processor, model } = await getVisionPipeline();
  const images = await Promise.all(filePaths.map((p) => RawImage.read(p)));
  const inputs = await processor(images);
  const { image_embeds } = await model(inputs);
  const data = image_embeds.data as Float32Array;
  const out: Float32Array[] = [];
  for (let i = 0; i < filePaths.length; i++) {
    out.push(l2Normalize(data.slice(i * EMBEDDING_DIM, (i + 1) * EMBEDDING_DIM)));
  }
  return out;
}

export function toVecBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}
