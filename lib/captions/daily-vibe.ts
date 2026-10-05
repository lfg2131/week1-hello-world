// A small rotating creation prompt. Deterministic per New York calendar day,
// so everyone sees the same vibe and it changes overnight.

export const DAILY_VIBES = [
  { title: "2am dollar slice", hint: "First time trying dollar pizza at 2am" },
  { title: "Dorm room reality", hint: "My dorm room the night before move-out" },
  { title: "Subway main character", hint: "Something I saw on the 1 train" },
  { title: "Butler Library hours", hint: "Hour six of studying in Butler" },
  { title: "Bodega cat check", hint: "The bodega cat clocked me again" },
  { title: "Weekend side quest", hint: "Accidentally walked 30 blocks for a bagel" },
  { title: "Dining hall mystery", hint: "Dining hall said this was pasta" },
  { title: "Rooftop golden hour", hint: "Pretending I live in a rom-com" },
  { title: "Laundry room standoff", hint: "Someone left their wet laundry again" },
  { title: "Midwest meets Manhattan", hint: "Still not used to how fast everyone walks" },
  { title: "Central Park energy", hint: "Sunday in Central Park with zero plans" },
  { title: "Group project era", hint: "The group chat at 11:58pm" },
  { title: "Steps of Low", hint: "Sitting on the Low Library steps like it’s a personality" },
  { title: "Overpriced coffee", hint: "This latte cost more than my textbook" },
] as const;

export function getDailyVibe(date = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const index = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000) % DAILY_VIBES.length;
  return DAILY_VIBES[index];
}
