import { createHash, randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
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
  function prepare(accountId: string, document: ProfessionalDocument) {
    const digest = createHash("sha256").update(document.buffer).digest("hex");
    return `${prefix(accountId)}${randomUUID()}-${digest}.${document.mimeType === "application/pdf" ? "pdf" : "docx"}`;
  }
  function checkOwner(accountId: string, key: string) {
    if (
      !key.startsWith(prefix(accountId)) ||
      !/^[\da-f-]+\.(pdf|docx)$/.test(key.slice(prefix(accountId).length))
    )
      throw new Error("FORBIDDEN_DOCUMENT");
  }
  async function upload(accountId: string, key: string, document: ProfessionalDocument) {
    checkOwner(accountId, key);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: document.buffer,
        ContentType: document.mimeType,
        ContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`,
        Metadata: { original_name: encodeURIComponent(document.name) },
      }),
      { abortSignal: AbortSignal.timeout(60_000) },
    );
  }
  async function access(accountId: string, key: string) {
    checkOwner(accountId, key);
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: 120,
    });
  }
  async function remove(accountId: string, key: string) {
    checkOwner(accountId, key);
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
  }
  async function read(accountId: string, key: string) {
    checkOwner(accountId, key);
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(30_000),
    });
    if (!result.Body) throw new Error("DOCUMENT_NOT_FOUND");
    return Buffer.from(await result.Body.transformToByteArray());
  }
  async function removeAccount(accountId: string, signal: AbortSignal) {
    const ownerPrefix = prefix(accountId);
    // Include uploads with no database reference and verify that the prefix is empty.
    for (;;) {
      const page = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: ownerPrefix, MaxKeys: 100 }),
        { abortSignal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
      );
      if (!page.Contents?.length) return;
      for (const object of page.Contents) {
        if (!object.Key?.startsWith(ownerPrefix)) throw new Error("INVALID_STORAGE_KEY");
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }),
          { abortSignal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
        );
      }
    }
  }
  return { prepare, upload, access, read, remove, removeAccount };
}
