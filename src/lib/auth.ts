import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import prisma from "./db";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "TOTP Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("E-post og passord er påkrevd");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user) {
          throw new Error("Ugyldig e-post eller passord");
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!passwordMatch) {
          throw new Error("Ugyldig e-post eller passord");
        }

        if (user.status === "SUSPENDED") {
          throw new Error("Kontoen din er suspendert. Kontakt administrator.");
        }

        if (user.status === "PENDING") {
          throw new Error("Kontoen din venter på godkjenning fra administrator.");
        }

        if (user.status !== "ACTIVE") {
          throw new Error("Kontoen din er ikke aktiv.");
        }

        if (user.totpEnabled && user.totpSecret) {
          if (!credentials.totpCode) {
            throw new Error("TOTP_REQUIRED");
          }

          if (user.totpLockedUntil && user.totpLockedUntil > new Date()) {
            const minutesLeft = Math.ceil((user.totpLockedUntil.getTime() - Date.now()) / 60000);
            throw new Error(`For mange feilede forsøk. Prøv igjen om ${minutesLeft} minutter.`);
          }

          const isValidTotp = authenticator.verify({
            token: credentials.totpCode,
            secret: user.totpSecret,
          });

          if (!isValidTotp) {
            const newFailedAttempts = user.totpFailedAttempts + 1;
            const lockoutTime = newFailedAttempts >= 5 
              ? new Date(Date.now() + 15 * 60 * 1000) 
              : null;

            await prisma.user.update({
              where: { id: user.id },
              data: {
                totpFailedAttempts: newFailedAttempts,
                totpLockedUntil: lockoutTime,
              },
            });

            if (lockoutTime) {
              throw new Error("For mange feilede forsøk. Kontoen er låst i 15 minutter.");
            }
            throw new Error("Ugyldig verifiseringskode");
          }

          await prisma.user.update({
            where: { id: user.id },
            data: {
              totpFailedAttempts: 0,
              totpLockedUntil: null,
            },
          });
        }

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          status: user.status,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.status = user.status;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.status = token.status;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
