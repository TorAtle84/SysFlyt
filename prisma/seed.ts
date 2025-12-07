import {
  DocumentType,
  PrismaClient,
  ProjectStatus,
  Role,
  UserStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const adminEmails = ["tm5479@gk.no", "flytlink.app@gmail.com"];
const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "Admin123!";

async function ensureAdmin(email: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await bcrypt.hash(defaultAdminPassword, 10);

  if (existing) {
    if (existing.role !== Role.ADMIN || existing.status !== UserStatus.ACTIVE) {
      await prisma.user.update({
        where: { email },
        data: { role: Role.ADMIN, status: UserStatus.ACTIVE, passwordHash },
      });
    }
    return existing;
  }

  return prisma.user.create({
    data: {
      email,
      firstName: email.split("@")[0] || "Admin",
      lastName: "User",
      passwordHash,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      title: "System Administrator",
    },
  });
}

async function main() {
  const admins = [];
  for (const email of adminEmails) {
    admins.push(await ensureAdmin(email));
  }

  const demoLeader = await prisma.user.upsert({
    where: { email: "prosjektleder@example.com" },
    update: {},
    create: {
      email: "prosjektleder@example.com",
      firstName: "Prosjekt",
      lastName: "Leder",
      passwordHash: await bcrypt.hash("Leader123!", 10),
      role: Role.PROJECT_LEADER,
      status: UserStatus.ACTIVE,
      title: "Prosjektleder",
      company: "SysLink AS",
      phone: "+47 999 99 999",
    },
  });

  const systemTags = await prisma.$transaction(
    ["360", "420"].map((code) =>
      prisma.systemTag.upsert({
        where: { code },
        update: {},
        create: { code, description: `System ${code}` },
      })
    )
  );

  await prisma.project.upsert({
    where: { id: "demo-project" },
    update: {},
    create: {
      id: "demo-project",
      name: "Fjord Tower U1",
      description: "Pilotprosjekt for dokumenthåndtering og QA.",
      status: ProjectStatus.ACTIVE,
      createdBy: { connect: { id: demoLeader.id } },
      members: {
        create: [
          { user: { connect: { id: demoLeader.id } }, role: Role.PROJECT_LEADER },
          { user: { connect: { id: admins[0].id } }, role: Role.ADMIN },
        ],
      },
      documents: {
        create: [
          {
            title: "Riggplan 360",
            url: "/demo/riggplan-360.pdf",
            type: DocumentType.DRAWING,
            systemTags: ["360"],
            tags: {
              create: systemTags
                .filter((t) => t.code === "360")
                .map((tag) => ({ systemTag: { connect: { id: tag.id } } })),
            },
          },
        ],
      },
      massList: {
        create: [
          { tfm: "+12453601RTA4001RTA0001", description: "Ventilasjonsaggregat", system: "360" },
          { tfm: "+12453601RTA5001RTA0002", description: "Kanalpakke", system: "360" },
        ],
      },
    },
  });

  console.log("Seed complete. Admins:", adminEmails.join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
