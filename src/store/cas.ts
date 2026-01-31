import { createReadStream } from 'node:fs';
import { mkdir, stat, rename, unlink, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';

export async function ensureStoreLayout(root: string) {
  await mkdir(join(root, 'objects'), { recursive: true });
  await mkdir(join(root, 'filesets'), { recursive: true });
  await mkdir(join(root, 'refs'), { recursive: true });
}

function objPath(root: string, sha256hex: string) {
  const d = sha256hex.slice(0, 2);
  const f = sha256hex.slice(2);
  return join(root, 'objects', d, f);
}

function filesetPath(root: string, filesetId: string) {
  const d = filesetId.slice(0, 2);
  const f = filesetId.slice(2);
  return join(root, 'filesets', d, f + '.json');
}

export class CasStore {
  constructor(private root: string) {}

  async ensureObjectDir(sha256hex: string) {
    await mkdir(join(this.root, 'objects', sha256hex.slice(0, 2)), { recursive: true });
  }

  async openObjectStream(sha256hex: string): Promise<Readable | null> {
    try {
      return createReadStream(objPath(this.root, sha256hex));
    } catch {
      return null;
    }
  }

  /** C1: objects can be committed early. */
  async commitTempObject(tmpPath: string, sha256hex: string): Promise<void> {
    await this.ensureObjectDir(sha256hex);
    const finalPath = objPath(this.root, sha256hex);
    try {
      await stat(finalPath);
      await unlink(tmpPath);
      return;
    } catch {
      // not exists
    }

    try {
      await rename(tmpPath, finalPath);
    } catch (e: any) {
      if (e?.code === 'EEXIST') {
        await unlink(tmpPath);
        return;
      }
      throw e;
    }
  }

  async storeFilesetManifest(filesetId: string, manifest: any): Promise<void> {
    await mkdir(join(this.root, 'filesets', filesetId.slice(0, 2)), { recursive: true });
    const p = filesetPath(this.root, filesetId);
    const tmp = p + '.tmp';
    await writeFile(tmp, JSON.stringify(manifest, null, 2), 'utf8');
    await rename(tmp, p);
  }

  async loadFilesetManifest(filesetId: string): Promise<any | null> {
    try {
      const p = filesetPath(this.root, filesetId);
      const txt = await readFile(p, 'utf8');
      return JSON.parse(txt);
    } catch {
      return null;
    }
  }

  async writeRef(name: string, filesetId: string): Promise<void> {
    const p = join(this.root, 'refs', name);
    const tmp = p + '.tmp';
    await writeFile(tmp, filesetId, 'utf8');
    await rename(tmp, p);
  }

  async readRef(name: string): Promise<string | null> {
    try {
      const p = join(this.root, 'refs', name);
      const txt = await readFile(p, 'utf8');
      return txt.trim();
    } catch {
      return null;
    }
  }

  private tmpRoot(): string {
    return join(this.root, 'tmp');
  }

  async makeTempPath(ext = '.tmp'): Promise<string> {
    const dir = this.tmpRoot();
    await mkdir(dir, { recursive: true });
    const name = `casobj-${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
    return join(dir, name);
  }
}
