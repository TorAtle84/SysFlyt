import { AppShell } from "@/components/layout/app-shell";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/pages/profile/profile-form";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");
  if (session.user.status === "PENDING") redirect("/pending");

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) redirect("/login");

  return (
    <AppShell>
      <ProfileForm user={user} />
    </AppShell>
  );
}
