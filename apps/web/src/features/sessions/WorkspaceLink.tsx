"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { navigateWorkspace } from "./workspaceRoutes";

type Props = Omit<ComponentProps<typeof Link>, "href" | "onNavigate" | "prefetch"> & {
  href: string;
};

export function WorkspaceLink({ href, ...props }: Props) {
  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onNavigate={(event) => {
        event.preventDefault();
        navigateWorkspace(href);
      }}
    />
  );
}
