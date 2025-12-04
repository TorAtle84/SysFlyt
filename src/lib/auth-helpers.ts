import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";
import prisma from "./db";

export type AuthUser = {
  id: string;
  email: string;
  role: "ADMIN" | "PROJECT_LEADER" | "USER" | "READER";
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
};

export type AuthResult = 
  | { success: true; user: AuthUser }
  | { success: false; error: NextResponse };

export async function requireAuth(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    return {
      success: false,
      error: NextResponse.json({ error: "Ikke autentisert" }, { status: 401 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, role: true, status: true },
  });

  if (!user) {
    return {
      success: false,
      error: NextResponse.json({ error: "Bruker ikke funnet" }, { status: 401 }),
    };
  }

  if (user.status !== "ACTIVE") {
    return {
      success: false,
      error: NextResponse.json({ error: "Kontoen er ikke aktiv" }, { status: 403 }),
    };
  }

  return {
    success: true,
    user: user as AuthUser,
  };
}

export async function requireAdmin(): Promise<AuthResult> {
  const authResult = await requireAuth();
  
  if (!authResult.success) {
    return authResult;
  }

  if (authResult.user.role !== "ADMIN") {
    return {
      success: false,
      error: NextResponse.json({ error: "Krever administratortilgang" }, { status: 403 }),
    };
  }

  return authResult;
}

export async function requireProjectAccess(projectId: string): Promise<AuthResult> {
  const authResult = await requireAuth();
  
  if (!authResult.success) {
    return authResult;
  }

  if (authResult.user.role === "ADMIN") {
    return authResult;
  }

  const membership = await prisma.projectMember.findFirst({
    where: {
      projectId,
      userId: authResult.user.id,
    },
  });

  if (!membership) {
    return {
      success: false,
      error: NextResponse.json({ error: "Ingen tilgang til dette prosjektet" }, { status: 403 }),
    };
  }

  return authResult;
}

export async function requireProjectLeaderAccess(projectId: string): Promise<AuthResult> {
  const authResult = await requireAuth();
  
  if (!authResult.success) {
    return authResult;
  }

  if (authResult.user.role === "ADMIN") {
    return authResult;
  }

  const membership = await prisma.projectMember.findFirst({
    where: {
      projectId,
      userId: authResult.user.id,
      role: "PROJECT_LEADER",
    },
  });

  if (!membership) {
    return {
      success: false,
      error: NextResponse.json({ error: "Krever prosjektledertilgang" }, { status: 403 }),
    };
  }

  return authResult;
}

export function canEditProject(userRole: string, memberRole?: string): boolean {
  if (userRole === "ADMIN" || userRole === "PROJECT_LEADER") {
    return true;
  }
  return memberRole === "PROJECT_LEADER" || memberRole === "USER";
}

export function canDeleteProject(userRole: string): boolean {
  return userRole === "ADMIN" || userRole === "PROJECT_LEADER";
}

export function canManageUsers(userRole: string): boolean {
  return userRole === "ADMIN";
}

export function canUploadDocuments(userRole: string, memberRole?: string): boolean {
  if (userRole === "ADMIN" || userRole === "PROJECT_LEADER") {
    return true;
  }
  return memberRole === "PROJECT_LEADER" || memberRole === "USER";
}

export function canAnnotateDocuments(userRole: string, memberRole?: string): boolean {
  if (userRole === "ADMIN" || userRole === "PROJECT_LEADER") {
    return true;
  }
  return memberRole !== "READER";
}
