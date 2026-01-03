
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const apps = [
        {
            code: "SYSLINK",
            name: "SysLink",
            description: "Kvalitetssikring og dokumenthåndtering",
        },
        {
            code: "FLYTLINK",
            name: "FlytLink",
            description: "Kravsporing og planlegging",
        },
    ];

    for (const app of apps) {
        await prisma.application.upsert({
            where: { code: app.code as any },
            update: {},
            create: {
                code: app.code as any,
                name: app.name,
                description: app.description,
            },
        });
        console.log(`Ensured application: ${app.name}`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
