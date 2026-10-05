import { redirect } from "next/navigation";
import { createClient } from "./server";
import { getVerifiedUserId } from "../auth";

/** For Server Components: a verified user or a redirect to /login. */
export async function requireUser() {
  const supabase = await createClient();
  const userId = await getVerifiedUserId(supabase);
  if (!userId) redirect("/login");
  return { supabase, userId };
}
