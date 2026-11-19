import { afterEach, expect, it, vi } from "vitest";
import { navigateWorkspace, workspaceRoute } from "./workspaceRoutes";

afterEach(() => vi.unstubAllGlobals());

it("matches the sidebar destinations and rejects paths outside the workspace", () => {
  expect(workspaceRoute("/")).toEqual({ area: "chat" });
  expect(workspaceRoute("/chat/example-123")).toEqual({ area: "chat", chatId: "example-123" });
  for (const area of ["dashboard", "applications", "documents", "profile"]) {
    expect(workspaceRoute(`/${area}`)).toEqual({ area });
  }
  for (const path of ["/auth/sign-in", "/chat/", "/chat/invalid/path", "/profile/other"]) {
    expect(workspaceRoute(path)).toBeUndefined();
  }
});

it("uses native history and skips an unchanged URL", () => {
  const pushState = vi.fn();
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: { pathname: "/documents", search: "?kind=cv", hash: "#files" },
    history: { pushState, replaceState },
  });
  navigateWorkspace("/documents?kind=cv#files");
  expect(pushState).not.toHaveBeenCalled();
  navigateWorkspace("/documents");
  expect(pushState).toHaveBeenCalledWith(null, "", "/documents");
  navigateWorkspace("/", true);
  expect(replaceState).toHaveBeenCalledWith(null, "", "/");
});
