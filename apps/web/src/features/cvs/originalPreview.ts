import { queryOptions } from "@tanstack/react-query";
import type { OriginalDocument } from "@mirai/contracts";
import { cvApi } from "./cvApi";

export function originalPreviewOptions(accountId: string, original: OriginalDocument) {
  return queryOptions({
    queryKey: ["original-content", accountId, original.id],
    queryFn: async ({ signal }) => {
      const blob = await cvApi.originalContent(original.id, signal);
      if (original.format === "pdf") return { blob };
      const { extractRawText } = await import("mammoth");
      const { value } = await extractRawText({ arrayBuffer: await blob.arrayBuffer() });
      return { text: value };
    },
    staleTime: Infinity,
    retry: false,
  });
}
