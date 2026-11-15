import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const bucket = process.env.NEON_STORAGE_BUCKET ?? "mirai-documents";
  const client = new S3Client({
    region: required("AWS_REGION"),
    endpoint: required("AWS_ENDPOINT_URL_S3"),
    forcePathStyle: true,
    credentials: {
      accessKeyId: required("AWS_ACCESS_KEY_ID"),
      secretAccessKey: required("AWS_SECRET_ACCESS_KEY"),
    },
  });
  const key = `setup-check/${randomUUID()}.txt`;
  const content = "mirai-object-storage-check";
  let uploaded = false;

  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: content,
      ContentType: "text/plain",
    }));
    uploaded = true;
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const received = await result.Body?.transformToString();
    if (received !== content) throw new Error("Object Storage content mismatch");
    console.info("Neon Object Storage: read/write verified");
  } finally {
    if (uploaded) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    client.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
