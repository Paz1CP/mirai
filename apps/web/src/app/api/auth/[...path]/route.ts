import { getAuth } from "@/shared/auth/server";

type Context = { params: Promise<{ path: string[] }> };
function handle(request: Request, context: Context) {
  const method = request.method;
  if (
    method !== "GET" &&
    method !== "POST" &&
    method !== "PUT" &&
    method !== "DELETE" &&
    method !== "PATCH"
  )
    return new Response(null, { status: 405 });
  return getAuth().handler()[method](request, context);
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE, handle as PATCH };
