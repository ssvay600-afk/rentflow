import { put } from "@vercel/blob";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export function uploadsConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Stores an uploaded image in Vercel Blob and returns its public URL.
 * `prefix` namespaces files per business, e.g. "businesses/<id>/logo".
 */
export async function uploadImage(file: File, prefix: string): Promise<string> {
  if (!uploadsConfigured()) throw new Error("Image uploads aren't configured on this install (BLOB_READ_WRITE_TOKEN).");
  if (!ALLOWED.has(file.type)) throw new Error("Please upload a JPG, PNG, WebP, GIF or AVIF image.");
  if (file.size > MAX_BYTES) throw new Error("Image is too large (max 5 MB).");
  const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const blob = await put(`${prefix}.${ext}`, file, { access: "public", addRandomSuffix: true, contentType: file.type });
  return blob.url;
}

/** Returns a File from FormData only when the user actually picked one. */
export function pickedFile(formData: FormData, name: string): File | null {
  const v = formData.get(name);
  return v instanceof File && v.size > 0 ? v : null;
}
