import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";

/**
 * MinIO through the S3 API. Two clients because signatures cover the host:
 * the server talks to MinIO on its internal address, while URLs handed to a
 * browser must be signed for the address the browser will actually use.
 */
const credentials = { accessKeyId: env.MINIO_ACCESS_KEY, secretAccessKey: env.MINIO_SECRET_KEY };

const internal = new S3Client({
  endpoint: env.MINIO_ENDPOINT,
  region: env.MINIO_REGION,
  credentials,
  forcePathStyle: true,
});

const publicFacing = new S3Client({
  endpoint: env.MINIO_PUBLIC_URL,
  region: env.MINIO_REGION,
  credentials,
  forcePathStyle: true,
});

const Bucket = env.MINIO_BUCKET;

/** Creates the private media bucket on first boot. Never makes it public. */
export async function ensureBucket(): Promise<void> {
  try {
    await internal.send(new HeadBucketCommand({ Bucket }));
  } catch {
    await internal.send(new CreateBucketCommand({ Bucket }));
    console.log(`[storage] created bucket "${Bucket}"`);
  }
}

/**
 * A one-shot browser upload. MinIO itself enforces the exact key, the content
 * type and the size ceiling, so a client cannot upload something larger or of a
 * different type than it was granted, whatever it sends.
 */
export function createUploadForm(input: {
  key: string;
  contentType: string;
  maxBytes: number;
  expiresSeconds: number;
}): Promise<{ url: string; fields: Record<string, string> }> {
  return createPresignedPost(publicFacing, {
    Bucket,
    Key: input.key,
    Conditions: [
      ["content-length-range", 1, input.maxBytes],
      ["eq", "$Content-Type", input.contentType],
    ],
    Fields: { "Content-Type": input.contentType },
    Expires: input.expiresSeconds,
  });
}

export async function headObject(
  key: string,
): Promise<{ size: number; contentType: string | undefined } | null> {
  try {
    const head = await internal.send(new HeadObjectCommand({ Bucket, Key: key }));
    return { size: head.ContentLength ?? 0, contentType: head.ContentType };
  } catch {
    return null;
  }
}

/** The first bytes of an object, for checking what it really is. */
export async function readObjectPrefix(key: string, bytes: number): Promise<Uint8Array> {
  const object = await internal.send(
    new GetObjectCommand({ Bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
  );
  return (await object.Body?.transformToByteArray()) ?? new Uint8Array();
}

export async function deleteObject(key: string): Promise<void> {
  await internal.send(new DeleteObjectCommand({ Bucket, Key: key })).catch(() => undefined);
}

/**
 * A short-lived download URL. The response type and disposition are pinned
 * here, so whatever the stored object claims, the browser gets the verified
 * type and treats it as media rather than a page.
 */
export function presignDownload(input: {
  key: string;
  contentType: string;
  fileName: string;
  expiresSeconds: number;
  /**
   * `attachment` hands the file to the browser to save instead of drawing it
   * in the page. Documents are served that way: it is what the reader wants
   * from a spreadsheet, and it means a file that turns out to be markup has
   * nowhere to run.
   */
  disposition?: "inline" | "attachment";
}): Promise<string> {
  const safeName = input.fileName.replace(/["\\\r\n]/g, "_");
  return getSignedUrl(
    publicFacing,
    new GetObjectCommand({
      Bucket,
      Key: input.key,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: `${input.disposition ?? "inline"}; filename="${safeName}"`,
      ResponseCacheControl: "private, max-age=300",
    }),
    { expiresIn: input.expiresSeconds },
  );
}
