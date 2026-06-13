const publicPaths = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/favicon.ico"
]);

export function isPublicPath(
  pathname: string,
  env: Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "VERCEL_ENV">> = process.env
) {
  if (pathname === "/dev/audit-scenarios") return env.NODE_ENV === "development";
  if (pathname === "/dev/product-mockups/today") return env.NODE_ENV === "development";

  return (
    publicPaths.has(pathname) ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/assets/")
  );
}
