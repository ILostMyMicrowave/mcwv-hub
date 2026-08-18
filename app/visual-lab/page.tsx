import type { Metadata } from "next";
import { notFound } from "next/navigation";
import VisualLab from "@/components/visual-lab/VisualLab";
import { getAuthenticatedUser } from "@/lib/authUser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Visual Laboratory",
  description: "Private MCWV visual technology experiments.",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Hidden owner-only route. Authentication and the current role are refreshed
 * from PostgreSQL by getAuthenticatedUser; a stale owner cookie is not enough.
 * Deliberately return a 404 to every non-owner and keep this route out of nav.
 */
export default async function VisualLabPage() {
  const user = await getAuthenticatedUser();
  if (user?.role !== "owner") notFound();

  return <VisualLab />;
}
