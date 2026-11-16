import type { NextRequest } from "next/server";
import { getAuth } from "@/shared/auth/server";

export default function proxy(request: NextRequest) {
  return getAuth().middleware({ loginUrl: "/auth/sign-in", publicRoutes: ["/health", "/images"] })(
    request,
  );
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
