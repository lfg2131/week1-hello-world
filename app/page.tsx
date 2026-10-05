import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/auth";

// The proxy normally redirects first; this keeps "/" correct on its own.
export default async function Home() {
  const userId = await getVerifiedUserId(await createClient());
  redirect(userId ? "/rate" : "/login");
}
