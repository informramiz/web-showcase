import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server/session";

// Seamless entry: signed-in users go to their boards; everyone else is auto-entered into the
// live demo (/api/demo) rather than hitting a login wall.
export default async function Home() {
  redirect((await getCurrentUser()) ? "/projects" : "/api/demo");
}
