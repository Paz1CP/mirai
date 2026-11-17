import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ProfessionalDocument } from "./extractProfile.js";

export function createDocumentStorage() {
  const client = new S3Client({
    region: process.env.AWS_REGION ?? "us-east-1",
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    forcePathStyle: true,
  });
  const bucket = process.env.NEON_STORAGE_BUCKET ?? "mirai-documents";
  const prefix = (accountId: string) =>
    `profiles/${createHash("sha256").update(accountId).digest("hex")}/`;
  async function upload(accountId: string, document: ProfessionalDocument) {
    const digest = createHash("sha256").update(document.buffer).digest("hex");
    const key = `${prefix(accountId)}${digest}.${document.mimeType === "application/pdf" ? "pdf" : "docx"}`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: document.buffer,
        ContentType: document.mimeType,
        ContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`,
        Metadata: { original_name: encodeURIComponent(document.name) },
      }),
    );
    return key;
  }
  async function access(accountId: string, key: string) {
    if (!key.startsWith(prefix(accountId)) || key.includes(".."))
      throw new Error("FORBIDDEN_DOCUMENT");
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: 120,
    });
  }
  return { upload, access };
}
