import { AppShell } from "@/components/layout/app-shell";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/pages/profile/profile-form";
import { TotpSetup } from "@/components/pages/profile/totp-setup";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");
  if (session.user.status === "PENDING") redirect("/pending");

  const user = await prisma.user.findUnique({ 
    where: { email: session.user.email },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      company: true,
      title: true,
      discipline: true,
      role: true,
      status: true,
      totpEnabled: true,
    }
  });
  if (!user) redirect("/login");

  return (
    <AppShell>
      <div className="space-y-6">
        <ProfileForm user={user} />
        <TotpSetup totpEnabled={user.totpEnabled} />
      </div>
    </AppShell>
  );
}
