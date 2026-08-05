import { notFound } from "next/navigation";
import AfkRoom from "@/components/afk/AfkRoom";
import { getAuthenticatedUser } from "@/lib/authUser";

export const dynamic = "force-dynamic";

/**
 * The AFK room is a private cozy corner of the hub — owner + officers only.
 * Everyone else gets a straight 404: for them this page does not exist,
 * so there's nothing to snoop, guess, or ask about.
 *
 * Role is read fresh from the DB (not the cookie) so a demotion locks the
 * door immediately. Owner-only would be:
 *   if (user?.role !== "owner") notFound();
 */
export default async function AfkPage() {
  const user = await getAuthenticatedUser();
  if (user?.role !== "owner" && user?.role !== "officer") notFound();

  return <AfkRoom />;
}
