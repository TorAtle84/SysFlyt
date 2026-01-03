import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/pages/profile/profile-form";
import { PasswordChange } from "@/components/pages/profile/password-change";
import { TotpSetup } from "@/components/pages/profile/totp-setup";
import { LinkDogSettings } from "@/components/linkdog";

export default async function FlytLinkProfilePage() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) redirect("/flytlink/login");
    if (session.user.status === "PENDING") redirect("/flytlink/pending");

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
            reportsAsProjectLeaderEnabled: true,
            reportsAsMemberEnabled: true,
            appAccess: {
                include: {
                    application: true
                }
            },
            role: true,
            status: true,
            totpEnabled: true,
        }
    });
    if (!user) redirect("/flytlink/login");

    return (
        <div className="space-y-6">
            <ProfileForm user={user} />
            <LinkDogSettings />
            <div className="grid gap-6 lg:grid-cols-2">
                <PasswordChange />
                <TotpSetup totpEnabled={user.totpEnabled} />
            </div>
        </div>
    );
}

