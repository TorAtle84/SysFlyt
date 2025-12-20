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
  const admins: { id: string }[] = [];
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

  // Seed predefined function tests (global templates)
  const predefinedTests = [
    {
      id: "pft_start_stop_001",
      category: "START_STOP" as const,
      systemPart: "Aggregat",
      function: "Normal start",
      testExecution: "Start anlegget via HMI/automatikk og verifiser at alle relevante komponenter starter i riktig rekkefølge.",
      acceptanceCriteria: "Anlegget starter uten alarmer, og sekvens følger prosjektert funksjonsbeskrivelse.",
    },
    {
      id: "pft_start_stop_002",
      category: "START_STOP" as const,
      systemPart: "Aggregat",
      function: "Normal stopp",
      testExecution: "Stopp anlegget via HMI/automatikk og verifiser kontrollert nedstengning.",
      acceptanceCriteria: "Anlegget stopper uten alarmer, og eventuelle etterløp/sekvenser fungerer.",
    },
    {
      id: "pft_security_001",
      category: "SECURITY" as const,
      systemPart: "Sikkerhet",
      function: "Nødstop",
      testExecution: "Aktiver nødstop og verifiser at anlegget går til sikker tilstand.",
      acceptanceCriteria: "Riktig sikker funksjon utløses, og anlegget kan ikke restartes uten reset iht. krav.",
    },
    {
      id: "pft_security_002",
      category: "SECURITY" as const,
      systemPart: "Brann",
      function: "Brannsignal",
      testExecution: "Simuler brannsignal og verifiser at anlegget responderer iht. brannstrategi.",
      acceptanceCriteria: "Riktig modus aktiveres (stopp/start/spjeld), og alarmer/logg registreres.",
    },
    {
      id: "pft_regulation_001",
      category: "REGULATION" as const,
      systemPart: "Regulering",
      function: "Settpunkt og regulering",
      testExecution: "Endre settpunkt og verifiser at regulering følger og stabiliserer innen rimelig tid.",
      acceptanceCriteria: "Reguleringssløyfe stabiliserer uten vedvarende oscillasjon, og måleverdier er plausible.",
    },
    {
      id: "pft_regulation_002",
      category: "REGULATION" as const,
      systemPart: "Sensorer",
      function: "Sensorverifikasjon",
      testExecution: "Sammenlign sensorverdier med referanse/kalibrert måling der det er relevant.",
      acceptanceCriteria: "Avvik er innenfor toleranser, og feil gir korrekt alarm/feilindikasjon.",
    },
    {
      id: "pft_external_001",
      category: "EXTERNAL" as const,
      systemPart: "Integrasjoner",
      function: "Eksterne signaler",
      testExecution: "Verifiser mottak og sending av eksterne signaler (BMS/SD, brann, adgang) iht. I/O-liste.",
      acceptanceCriteria: "Signaler overføres korrekt, og feil håndteres med alarm/logg.",
    },
    {
      id: "pft_other_001",
      category: "OTHER" as const,
      systemPart: "Dokumentasjon",
      function: "Merking og sporbarhet",
      testExecution: "Verifiser at relevant merking, komponent-ID og referanser stemmer med tegning/systemskjema.",
      acceptanceCriteria: "ID-er og merking er konsistente og sporbare mot dokumentasjon.",
    },
  ];

  await prisma.$transaction(
    predefinedTests.map((t) =>
      prisma.predefinedFunctionTest.upsert({
        where: { id: t.id },
        update: {
          category: t.category,
          systemPart: t.systemPart,
          function: t.function,
          testExecution: t.testExecution,
          acceptanceCriteria: t.acceptanceCriteria,
          isActive: true,
          createdById: admins[0]?.id,
        },
        create: {
          id: t.id,
          category: t.category,
          systemPart: t.systemPart,
          function: t.function,
          testExecution: t.testExecution,
          acceptanceCriteria: t.acceptanceCriteria,
          isActive: true,
          createdById: admins[0]?.id,
        },
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
