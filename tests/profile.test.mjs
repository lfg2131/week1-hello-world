import assert from "node:assert/strict";
import { test } from "node:test";
import { isProfileComplete, parseNames, validateAvatar, isOwnedAvatarPath, MAX_AVATAR_SIZE } from "../lib/profile.ts";

for (const [label, profile, expected] of [
  ["null profile", null, false],
  ["null names", { first_name: null, last_name: null }, false],
  ["missing first", { first_name: null, last_name: "Smith" }, false],
  ["missing last", { first_name: "Alex", last_name: "" }, false],
  ["whitespace", { first_name: " \t", last_name: "Smith" }, false],
  ["valid trimmed names", { first_name: " Alex ", last_name: " Smith " }, true],
]) test(`profile completion: ${label}`, () => assert.equal(isProfileComplete(profile), expected));

test("name updates trim and keep legacy fields coherent", () => {
  assert.deepEqual(parseNames(" Alex ", " Smith "), { first_name: "Alex", last_name: "Smith", name: "Alex Smith", initials: "AS" });
  assert.equal(parseNames(" ", "Smith"), null);
  assert.equal(parseNames("a".repeat(81), "Smith"), null);
  assert.equal(parseNames(new File([], "name"), "Smith"), null);
  assert.ok(parseNames("a".repeat(80), "Smith"));
});

test("avatars validate format and size boundaries", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) assert.equal(validateAvatar({ type, size: MAX_AVATAR_SIZE }), null);
  for (const file of [{ type: "image/svg+xml", size: 1 }, { type: "image/png", size: 0 }, { type: "image/png", size: MAX_AVATAR_SIZE + 1 }]) assert.ok(validateAvatar(file));
});

test("avatar paths cannot escape the authenticated user's profile folder", () => {
  const path = "alice/profile/avatar-12345678-1234-1234-1234-123456789abc.webp";
  assert.equal(isOwnedAvatarPath(path, "alice"), true);
  for (const bad of [path.replace("alice", "bob"), path.replace("profile/", "profile/../"), path + "?x", "https://evil.example/image.webp", "data:image/png;base64,aaa"]) assert.equal(isOwnedAvatarPath(bad, "alice"), false);
});
