export const documentLimits = {
  count: 10,
  evidence: 9,
  fileBytes: 10 * 1024 * 1024,
  totalBytes: 30 * 1024 * 1024,
} as const;

export function documentSelectionError(files: readonly { name: string; size: number }[]) {
  if (files.length > documentLimits.count) return "DOCUMENT_COUNT";
  if (files.some((file) => !/\.(pdf|docx)$/i.test(file.name))) return "UNSUPPORTED_DOCUMENT";
  if (files.some((file) => !file.size)) return "EMPTY_DOCUMENT";
  if (files.some((file) => file.size > documentLimits.fileBytes)) return "DOCUMENT_TOO_LARGE";
  if (files.reduce((total, file) => total + file.size, 0) > documentLimits.totalBytes)
    return "DOCUMENTS_TOO_LARGE";
  return undefined;
}
