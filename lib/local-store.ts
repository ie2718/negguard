import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { AnalysisResult } from "@/lib/analysis/types";

const DATA_ROOT = path.join(process.cwd(), ".data");
const UPLOADS_DIR = path.join(DATA_ROOT, "uploads");
const META_DIR = path.join(DATA_ROOT, "meta");

export type UploadMeta = {
  id: string;
  user_id: string | null;
  filename: string;
  bytes: number;
  row_count: number;
  status: string;
  storage_path: string;
  mapped_columns: Record<string, string>;
  missing_required: string[];
  currency?: string;
  currency_source?: string;
  created_at: string;
};

async function ensureDirs() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.mkdir(META_DIR, { recursive: true });
}

export async function saveUploadLocal(
  filename: string,
  buffer: Buffer,
  extra: {
    row_count: number;
    mapped_columns: Record<string, string>;
    missing_required: string[];
    status?: string;
    currency?: string;
    currency_source?: string;
  }
): Promise<UploadMeta> {
  await ensureDirs();
  const id = randomUUID();
  const safeName = filename.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, "_");
  const storage_path = path.join(UPLOADS_DIR, `${id}_${safeName}`);
  await fs.writeFile(storage_path, buffer);

  const meta: UploadMeta = {
    id,
    user_id: null,
    filename,
    bytes: buffer.length,
    row_count: extra.row_count,
    status: extra.status ?? "uploaded",
    storage_path: `.data/uploads/${id}_${safeName}`,
    mapped_columns: extra.mapped_columns,
    missing_required: extra.missing_required,
    currency: extra.currency,
    currency_source: extra.currency_source,
    created_at: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(META_DIR, `${id}.json`),
    JSON.stringify(meta, null, 2),
    "utf8"
  );
  return meta;
}

export async function getUploadMeta(id: string): Promise<UploadMeta | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const raw = await fs.readFile(path.join(META_DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as UploadMeta;
  } catch {
    return null;
  }
}

/* ---------- analysis jobs (Day2) ---------- */

export type AnalysisJob = AnalysisResult & {
  id: string;
  upload_id: string;
  status: "succeeded" | "failed";
  error: string | null;
  created_at: string;
};

const JOBS_DIR = path.join(DATA_ROOT, "meta", "jobs");

export async function readUploadFile(meta: UploadMeta): Promise<Buffer> {
  return fs.readFile(path.join(UPLOADS_DIR, path.basename(meta.storage_path)));
}

export async function saveAnalysisJob(job: AnalysisJob): Promise<void> {
  await fs.mkdir(JOBS_DIR, { recursive: true });
  await fs.writeFile(path.join(JOBS_DIR, `${job.id}.json`), JSON.stringify(job, null, 2), "utf8");
  // pointer: latest job for upload
  await fs.writeFile(
    path.join(JOBS_DIR, `latest_${job.upload_id}.json`),
    JSON.stringify({ job_id: job.id }),
    "utf8"
  );
}

export async function getLatestJobForUpload(uploadId: string): Promise<AnalysisJob | null> {
  if (!/^[0-9a-f-]{36}$/i.test(uploadId)) return null;
  try {
    const ptr = JSON.parse(await fs.readFile(path.join(JOBS_DIR, `latest_${uploadId}.json`), "utf8"));
    return JSON.parse(await fs.readFile(path.join(JOBS_DIR, `${ptr.job_id}.json`), "utf8"));
  } catch {
    return null;
  }
}

