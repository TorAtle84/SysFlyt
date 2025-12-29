const { execSync } = require("node:child_process");

function run(command) {
  execSync(command, { stdio: "inherit" });
}

const shouldMigrate = ["1", "true", "yes"].includes(
  String(process.env.RUN_MIGRATIONS || "").toLowerCase()
);

if (shouldMigrate) {
  run("npx prisma migrate deploy");
} else {
  console.log("Skipping prisma migrate deploy (set RUN_MIGRATIONS=1 to enable).");
}

run("next build");
