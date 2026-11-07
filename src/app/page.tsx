import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server/session";

export default async function Home() {
  redirect((await getCurrentUser()) ? "/projects" : "/login");
}
