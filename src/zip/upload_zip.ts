import { IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWriteStream, createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import zlib from 'node:zlib';
import { open } from 'node:fs/promises';

import { CasStore } from '../store/cas.js';
import { ZipStreamReader } from './zip_stream.js';
import { teeToSpool } from './spool.js';
import { readCentralDirectory } from './central_directory.js';

export type UploadLimits = {
  maxEntries: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxZipBytes: number;
};

// CRC32 for ZIP validation.
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32Update(crc: number, buf: Buffer): number {
  crc = crc ^ 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC32_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function normalizeZipPath(p: string): string {
  if (p.includes('\u0000')) throw new Error('Invalid filename (NUL)');
  p = p.replace(/\\/g, '/');
  while (p.startsWith('./')) p = p.slice(2);
  if (p.startsWith('/')) throw new Error('Absolute paths not allowed');
  const parts = p.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') throw new Error('Parent path not allowed');
    out.push(part);
  }
  return out.join('/');
}

type StreamResult = { sha256: string; size: number; crc32: number };

async function processRawToCas(cas: CasStore, rawStream: NodeJS.ReadableStream, limits: UploadLimits): Promise<StreamResult> {
  const sha = createHash('sha256');
  let crc = 0;
  let rawSize = 0;

  // const tmp = join(tmpdir(), `casobj-${Date.now()}-${Math.random().toString(16).slice(2)}.brtmp`);
  const tmp = await cas.makeTempPath('.brtmp');
  const brotli = zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
  const sink = createWriteStream(tmp, { flags: 'wx' });

  const tap = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      try {
        rawSize += chunk.length;
        if (rawSize > limits.maxFileBytes) throw new Error('File too large');
        sha.update(chunk);
        crc = crc32Update(crc, chunk);
        cb(null, chunk);
      } catch (e: any) {
        cb(e);
      }
    }
  });

  await pipeline(rawStream as any, tap, brotli, sink);

  const shaHex = sha.digest('hex');
  await cas.commitTempObject(tmp, shaHex);
  return { sha256: shaHex, size: rawSize, crc32: crc >>> 0 };
}

async function processEntryFromSpool(opts: {
  cas: CasStore;
  zipPath: string;
  localHeaderOffset: bigint;
  method: number;
  compressedSize: bigint;
  limits: UploadLimits;
}): Promise<StreamResult> {
  const { cas, zipPath, localHeaderOffset, method, compressedSize, limits } = opts;
  const fh = await open(zipPath, 'r');
  try {
    const h = Buffer.alloc(30);
    await fh.read(h, 0, 30, Number(localHeaderOffset));
    if (h.readUInt32LE(0) !== 0x04034b50) throw new Error('Local header signature mismatch');
    const nameLen = h.readUInt16LE(26);
    const extraLen = h.readUInt16LE(28);
    const dataStart = localHeaderOffset + 30n + BigInt(nameLen + extraLen);

    const max = BigInt(Number.MAX_SAFE_INTEGER);
    if (compressedSize < 0n || compressedSize > max) throw new Error('Entry too large');

    const start = Number(dataStart);
    const end = Number(dataStart + compressedSize - 1n);
    const rs = createReadStream(zipPath, { start, end });

    if (method === 0) return await processRawToCas(cas, rs, limits);
    if (method === 8) return await processRawToCas(cas, rs.pipe(zlib.createInflateRaw()), limits);
    throw new Error(`Unsupported method in fallback: ${method}`);
  } finally {
    await fh.close();
  }
}

export async function uploadZipAsFileset(opts: {
  req: IncomingMessage;
  cas: CasStore;
  updateRef: string | null;
  limits: UploadLimits;
}) {
  const { req, cas, updateRef, limits } = opts;

  const spoolPath = join(tmpdir(), `upload-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`);
  const { pass, spoolDone } = await teeToSpool(req, spoolPath, limits.maxZipBytes);

  const zr = new ZipStreamReader(pass);
  const processed = new Map<string, StreamResult>();

  let entryCount = 0;
  let totalBytes = 0;
  const warnings: string[] = [];

  // Streaming phase
  for (;;) {
    const hdr = await zr.nextHeader();
    if (!hdr) break;

    entryCount += 1;
    if (entryCount > limits.maxEntries) throw new Error('Too many entries');

    const usesDD = (hdr.flags & 0x08) !== 0;
    const zip64Sizes = hdr.compressedSize > 0xFFFFFFFFn || hdr.uncompressedSize > 0xFFFFFFFFn;

    // STORE + DD is deferred to Central Directory fallback.
    if (usesDD && hdr.method === 0) {
      warnings.push(`Deferred STORE+DD at offset ${hdr.localHeaderOffset}`);
      continue;
    }

    let rawStream: NodeJS.ReadableStream;
    if (!usesDD) {
      const src = zr.streamCompressedKnown(hdr.compressedSize);
      rawStream = hdr.method === 0 ? src : src.pipe(zlib.createInflateRaw());
    } else {
      const src = zr.streamCompressedUnknown();
      rawStream = src.pipe(zlib.createInflateRaw());
    }

    const r = await processRawToCas(cas, rawStream, limits);
    totalBytes += r.size;
    if (totalBytes > limits.maxTotalBytes) throw new Error('Total too large');

    if (!usesDD) {
      if (hdr.uncompressedSize !== 0n && hdr.uncompressedSize !== BigInt(r.size)) throw new Error('Size mismatch (local header)');
      if (hdr.crc32 !== 0 && hdr.crc32 !== r.crc32) throw new Error('CRC mismatch (local header)');
    } else {
      const dd = await zr.readDataDescriptor(zip64Sizes);
      if (dd.uncompressedSize !== BigInt(r.size)) throw new Error('Size mismatch (DD)');
      if (dd.crc32 !== r.crc32) throw new Error('CRC mismatch (DD)');
    }

    processed.set(hdr.localHeaderOffset.toString(), r);
  }

  await spoolDone;

  // Finalize using Central Directory
  const cd = await readCentralDirectory(spoolPath);
  warnings.push(...cd.warnings);

  const finalEntries: Array<{ path: string; sha256: string; size: number }> = [];
  const seenPaths = new Map<string, number>();

  for (const e of cd.entries) {
    if (e.isDirectory) continue;
    if (e.method !== 0 && e.method !== 8) throw new Error(`Unsupported method in CD: ${e.method}`);

    const norm = normalizeZipPath(e.fileName);
    if (!norm) continue;

    const key = e.localHeaderOffset.toString();
    let r = processed.get(key);
    if (r) {
      if (BigInt(r.size) !== e.uncompressedSize) throw new Error(`Size mismatch vs CD for ${norm}`);
      if (r.crc32 !== e.crc32) throw new Error(`CRC mismatch vs CD for ${norm}`);
    } else {
      r = await processEntryFromSpool({
        cas,
        zipPath: spoolPath,
        localHeaderOffset: e.localHeaderOffset,
        method: e.method,
        compressedSize: e.compressedSize,
        limits,
      });
      if (BigInt(r.size) !== e.uncompressedSize) throw new Error(`Fallback size mismatch for ${norm}`);
      if (r.crc32 !== e.crc32) throw new Error(`Fallback CRC mismatch for ${norm}`);
      processed.set(key, r);
    }

    // Duplicate paths: last wins
    if (seenPaths.has(norm)) {
      warnings.push(`Duplicate path: ${norm} (last wins)`);
      const idx = seenPaths.get(norm)!;
      finalEntries[idx] = { path: norm, sha256: r.sha256, size: r.size };
    } else {
      seenPaths.set(norm, finalEntries.length);
      finalEntries.push({ path: norm, sha256: r.sha256, size: r.size });
    }
  }

  finalEntries.sort((a, b) => a.path.localeCompare(b.path));
  const canonical = finalEntries.map(e => `${e.path} sha256:${e.sha256} ${e.size}
`).join('');
  const filesetId = createHash('sha256').update('v1 ').update(canonical, 'utf8').digest('hex');

  const manifest = {
    schema: 'fileset.v1',
    fileset_id: filesetId,
    file_count: finalEntries.length,
    total_bytes: finalEntries.reduce((s, e) => s + e.size, 0),
    files: finalEntries,
    warnings,
  };

  await cas.storeFilesetManifest(filesetId, manifest);
  if (updateRef) await cas.writeRef(updateRef, filesetId);

  if (!process.env.KEEP_SPOOL) {
    try { await unlink(spoolPath); } catch { /* ignore */ }
  }

  return { filesetId, manifest, updatedRef: updateRef };
}
