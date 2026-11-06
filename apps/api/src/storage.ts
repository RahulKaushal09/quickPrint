// File storage: local disk for a single server, any S3-compatible bucket
// (AWS S3, Cloudflare R2, MinIO) once there is more than one API server.

import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { Response } from 'express';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PageChoice } from '@seedhaprint/shared';
import { config } from './config';
import { layoutForPrint } from './documents';

interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  stream(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}

function localStorage(root: string): Storage {
  const full = (key: string) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(path.resolve(root) + path.sep)) throw new Error('Bad storage key');
    return p;
  };
  return {
    async put(key, data) {
      await fs.promises.mkdir(path.dirname(full(key)), { recursive: true });
      await fs.promises.writeFile(full(key), data);
    },
    async stream(key) {
      await fs.promises.access(full(key));
      return fs.createReadStream(full(key));
    },
    async remove(key) {
      await fs.promises.rm(full(key), { force: true });
    },
  };
}

function s3Storage(c: NonNullable<typeof config.s3>): Storage {
  const client = new S3Client({
    region: c.region,
    endpoint: c.endpoint,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
  return {
    async put(key, data, contentType) {
      await client.send(new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: data, ContentType: contentType }));
    },
    async stream(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: c.bucket, Key: key }));
      return res.Body as Readable;
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key }));
    },
  };
}

export async function readAll(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of await storage.stream(key)) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** The file as the printer should get it: the chosen pages on upright A4. */
export async function sendPrintFile(res: Response, job: { file: { key?: string | null }; pageList?: unknown }) {
  const pdf = await layoutForPrint(await readAll(job.file.key!), (job.pageList ?? []) as PageChoice[]);
  res.setHeader('Content-Type', 'application/pdf');
  res.end(pdf);
}

export const storage: Storage = config.s3 ? s3Storage(config.s3) : localStorage(config.storageDir);
