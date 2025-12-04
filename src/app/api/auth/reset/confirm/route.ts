import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Ugyldig data" }, { status: 400 });

  const { token, password } = parsed.data;

  const record = await prisma.verificationToken.findUnique({ where: { token } });
  if (!record || record.expires < new Date()) {
    return NextResponse.json({ error: "Token er utløpt eller ugyldig" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: record.identifier } });
  if (!user) return NextResponse.json({ error: "Bruker finnes ikke" }, { status: 404 });

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await prisma.verificationToken.delete({ where: { token } });

  return NextResponse.json({ ok: true });
}
