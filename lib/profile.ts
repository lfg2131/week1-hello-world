export type Profile = {
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

export function isProfileComplete(profile: Pick<Profile, "first_name" | "last_name"> | null) {
  return Boolean(profile?.first_name?.trim() && profile?.last_name?.trim());
}

export function parseNames(first: unknown, last: unknown) {
  if (typeof first !== "string" || typeof last !== "string") return null;
  const first_name = first.trim();
  const last_name = last.trim();
  if (!first_name || !last_name || first_name.length > 80 || last_name.length > 80) return null;
  return {
    first_name,
    last_name,
    name: `${first_name} ${last_name}`,
    initials: `${Array.from(first_name)[0]}${Array.from(last_name)[0]}`.toUpperCase(),
  };
}

export const AVATAR_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

export function validateAvatar(file: { type: string; size: number }) {
  if (!Object.hasOwn(AVATAR_TYPES, file.type)) return "Choose a JPEG, PNG, or WebP image.";
  if (file.size <= 0 || file.size > MAX_AVATAR_SIZE) return "Choose an image between 1 byte and 5 MB.";
  return null;
}

export function isOwnedAvatarPath(path: string, userId: string) {
  return path.startsWith(`${userId}/profile/`) &&
    /^avatar-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(path.slice(`${userId}/profile/`.length));
}
