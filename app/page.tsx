import { redirect } from "next/navigation";

// Explore is the public home page; the proxy normally redirects first.
export default function Home() {
  redirect("/explore");
}
