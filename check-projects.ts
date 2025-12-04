import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const projects = await prisma.project.findMany({
        include: {
            createdBy: {
                select: { email: true, firstName: true, lastName: true }
            },
            members: {
                include: {
                    user: {
                        select: { email: true }
                    }
                }
            }
        }
    })

    console.log('Projects in DB:', projects.length)
    projects.forEach(p => {
        console.log(`- Project: "${p.name}" (ID: ${p.id})`)
        console.log(`  Owner: ${p.createdBy?.email || 'Unknown'}`)
        console.log(`  Members: ${p.members.map(m => m.user.email).join(', ')}`)
    })
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
