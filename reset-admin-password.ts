import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    const email = "flytlink.app@gmail.com";
    const password = "Admin123!";
    const passwordHash = await bcrypt.hash(password, 10);

    console.log(`Resetting password for ${email}...`);

    const user = await prisma.user.update({
        where: { email },
        data: { passwordHash },
    });

    console.log("Password reset successfully.");
    console.log(`User: ${user.email}`);
    console.log(`New Password: ${password}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
