// Shared, dependency-free validation for Caption Lab. Used by the browser for
// fast feedback and re-run on the server, where it is the security boundary.

export const MEDIA_BUCKET = "week4-media";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_CONTEXT_LENGTH = 200;
export const CAPTION_COUNT = 3;
export const MAX_CAPTION_LENGTH = 200;

export const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type ImageMimeType = keyof typeof IMAGE_TYPES;
export type ImageExtension = (typeof IMAGE_TYPES)[ImageMimeType];

export const TONES = ["clever", "dry", "chaotic"] as const;
export type Tone = (typeof TONES)[number];

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID}$`);
const IMAGE_PATH_RE = new RegExp(`^(${UUID})/${UUID}\\.(jpg|png|webp)$`);

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isImageMimeType(value: unknown): value is ImageMimeType {
  return typeof value === "string" && Object.hasOwn(IMAGE_TYPES, value);
}

/** Client- and server-side check of declared upload metadata. */
export function validateImageFile(file: { type: string; size: number; name?: string }): string | null {
  if (!isImageMimeType(file.type)) return "That file type isn’t supported. Use a JPEG, PNG, or WebP photo.";
  if (file.name !== undefined) {
    const extension = file.name.toLowerCase().split(".").pop();
    const allowed: string[] = file.type === "image/jpeg" ? ["jpg", "jpeg"] : [IMAGE_TYPES[file.type]];
    if (!extension || !allowed.includes(extension)) return "The file extension doesn’t match the image type. Use a .jpg, .png, or .webp photo.";
  }
  if (file.size <= 0) return "That photo looks empty. Try another one.";
  if (file.size > MAX_IMAGE_BYTES) return "That photo is over 5 MB. Try a smaller one or a screenshot.";
  return null;
}

/** Identify an image by its magic bytes; never trust a declared MIME type alone. */
export function sniffImageType(bytes: Uint8Array): ImageMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** Storage object path for a new upload, always inside the verified user's folder. */
export function buildImagePath(userId: string, objectId: string, mimeType: ImageMimeType) {
  if (!isUuid(userId) || !isUuid(objectId)) throw new Error("Invalid upload identifiers");
  return `${userId}/${objectId}.${IMAGE_TYPES[mimeType]}`;
}

/** True only for `<userId>/<uuid>.<ext>`; rejects traversal, other folders, URLs. */
export function isOwnedImagePath(path: unknown, userId: string): path is string {
  if (typeof path !== "string") return false;
  const match = IMAGE_PATH_RE.exec(path);
  return Boolean(match && match[1] === userId);
}

export function extensionMimeType(path: string): ImageMimeType | null {
  const extension = path.split(".").pop();
  const entry = Object.entries(IMAGE_TYPES).find(([, ext]) => ext === extension);
  return entry ? (entry[0] as ImageMimeType) : null;
}

export type GenerationOptions = { context: string | null; tone: Tone | null };

/** Normalize optional creator context and tone. Returns an error string when invalid. */
export function parseGenerationOptions(context: unknown, tone: unknown): GenerationOptions | { error: string } {
  if (context !== null && context !== undefined && typeof context !== "string") return { error: "Context must be text." };
  if (tone !== null && tone !== undefined && tone !== "" && !(TONES as readonly unknown[]).includes(tone)) {
    return { error: "Pick Clever, Dry, Chaotic, or Surprise me." };
  }
  // Strip control characters and collapse whitespace so the stored prompt is tidy.
  const cleaned = typeof context === "string" ? context.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "";
  if (cleaned.length > MAX_CONTEXT_LENGTH) return { error: `Keep context under ${MAX_CONTEXT_LENGTH} characters.` };
  return { context: cleaned || null, tone: tone ? (tone as Tone) : null };
}

/** A vote is exactly +1 (Funny) or -1 (Not funny); everything else is rejected. */
export function parseVote(value: unknown): 1 | -1 | null {
  if (value === 1 || value === "1") return 1;
  if (value === -1 || value === "-1") return -1;
  return null;
}
