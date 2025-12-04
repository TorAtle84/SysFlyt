import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const protectedPaths = ["/dashboard", "/projects", "/admin", "/profile"];
const apiProtected = ["/api/projects", "/api/admin", "/api/documents"];

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname;

  const isProtected =
    protectedPaths.some((p) => path.startsWith(p)) ||
    apiProtected.some((p) => path.startsWith(p));

  if (!isProtected) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    if (path.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (token.status === "SUSPENDED") {
    if (path.startsWith("/api")) {
      return NextResponse.json({ error: "Kontoen er suspendert" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/login?error=suspended", req.url));
  }

  if (token.status === "PENDING" && path !== "/pending") {
    if (path.startsWith("/api")) {
      return NextResponse.json({ error: "Kontoen venter på godkjenning" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/pending", req.url));
  }

  if (token.status !== "ACTIVE" && path !== "/pending") {
    if (path.startsWith("/api")) {
      return NextResponse.json({ error: "Kontoen er ikke aktiv" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (path.startsWith("/admin") && token.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/projects/:path*", "/admin/:path*", "/profile", "/api/:path*"],
};
