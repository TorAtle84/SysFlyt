import prisma from "./src/lib/db";

async function checkComparisons() {
    console.log("Checking TfmComparison table...");

    const comparisons = await prisma.tfmComparison.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            createdBy: { select: { firstName: true, lastName: true } },
            project: { select: { name: true } },
        },
    });

    console.log(`Found ${comparisons.length} comparisons in database:`);
    comparisons.forEach((c, i) => {
        console.log(`${i + 1}. ${c.name} (${c.project.name}) - ${c.fileUrl}`);
    });

    // Also check all projects
    const projects = await prisma.project.findMany({
        select: { id: true, name: true },
    });

    console.log("\nProjects:");
    projects.forEach(p => console.log(`  - ${p.name} (${p.id})`));
}

checkComparisons()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
