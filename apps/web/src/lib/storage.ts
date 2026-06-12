/**
 * Media storage driver (m0-technical-spec §3): `local` writes under .data/uploads
 * (dev), `s3` issues presigned URLs (prod, wired in M1 infra work).
 */
import { env } from "@gigit/db";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
// Audio is stored as-is — no transcode service (engineering-spec K8).
export const AUDIO_MAX_BYTES = 25 * 1024 * 1024;
export const AUDIO_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a"];
export const PER_PROFILE_IMAGE_QUOTA = 20;
export const PER_PROFILE_AUDIO_QUOTA = 10;
export const PER_PROFILE_EMBED_QUOTA = 5;

export function mediaKindFor(contentType: string): "image" | "audio" | null {
  if (IMAGE_TYPES.includes(contentType)) return "image";
  if (AUDIO_TYPES.includes(contentType)) return "audio";
  return null;
}

export interface UploadTarget {
  /** where the client should send the bytes */
  uploadUrl: string;
  method: "PUT";
  storageKey: string;
}

export function uploadTargetFor(mediaId: string, contentType: string): UploadTarget {
  if (env().STORAGE_DRIVER === "s3") {
    // M1: @aws-sdk presigned PUT against env().S3_BUCKET. Fails loudly until wired.
    throw new Error("s3 storage driver not wired yet (M1 infra milestone)");
  }
  return {
    uploadUrl: `/api/media/${mediaId}/upload`,
    method: "PUT",
    storageKey: `local/${mediaId}.${extFor(contentType)}`,
  };
}

export async function localWrite(storageKey: string, bytes: Buffer): Promise<void> {
  const root = path.join(process.cwd(), ".data", "uploads");
  const file = path.join(root, path.basename(storageKey));
  await mkdir(root, { recursive: true });
  await writeFile(file, bytes);
}

export function localPublicPath(storageKey: string): string {
  return `/api/media/file/${path.basename(storageKey)}`;
}

function extFor(contentType: string): string {
  return (
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/x-m4a": "m4a",
    }[contentType] ?? "bin"
  );
}
