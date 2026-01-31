import http from 'node:http';
import { URL } from 'node:url';
import { CasStore, ensureStoreLayout } from './store/cas.js';
import { uploadZipAsFileset } from './zip/upload_zip.js';
import { serveApiDocsHtml, serveOpenApi } from './docs/serve.js';
import { APIDOCS_HTML } from './docs/ui.js';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? '8787');
const ROOT = process.env.STORE_DIR ?? './store';

await ensureStoreLayout(ROOT);
const cas = new CasStore(ROOT);

function sendText(res: http.ServerResponse, status: number, body: string, headers: Record<string, string> = {}) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body).toString(),
    ...headers,
  });
  res.end(body);
}

function sendJson(res: http.ServerResponse, status: number, obj: unknown, headers: Record<string, string> = {}) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body).toString(),
    ...headers,
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? HOST}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';

    // Docs
    if (serveOpenApi(req, res, path)) return;
    if (serveApiDocsHtml(req, res, path, APIDOCS_HTML)) return;

    if (method === 'GET' && path === '/health') {
      return sendText(res, 200, 'ok');
    }

    if (method === 'POST' && path === '/filesets') {
      const ct = (req.headers['content-type'] ?? '').toString();
      if (!ct.includes('application/zip')) {
        return sendText(res, 415, 'Expected Content-Type: application/zip');
      }

      const updateRef = url.searchParams.get('update_ref') ?? 'latest';
      const result = await uploadZipAsFileset({
        req,
        cas,
        updateRef: updateRef === '' ? null : updateRef,
        limits: {
          maxEntries: 8000,
          maxFileBytes: 500 * 1024 * 1024,
          maxTotalBytes: 2 * 1024 * 1024 * 1024,
          maxZipBytes: 300 * 1024 * 1024,
        },
      });

      const accept = (req.headers['accept'] ?? 'application/json').toString();
      const location = `/filesets/${result.filesetId}`;
      if (accept.includes('application/json') || accept.includes('*/*')) {
        return sendJson(res, 201, result, { location });
      }
      return sendText(res, 201, result.filesetId, { location });
    }

    if (method === 'GET' && path.startsWith('/filesets/')) {
      const id = path.split('/')[2] ?? '';
      if (!id) return sendText(res, 400, 'Missing fileset id');
      const manifest = await cas.loadFilesetManifest(id);
      if (!manifest) return sendText(res, 404, 'Not found');
      return sendJson(res, 200, manifest, { etag: `"sha256:${id}"` });
    }

    if (method === 'GET' && path.startsWith('/objects/')) {
      const sha = path.split('/')[2] ?? '';
      if (!sha) return sendText(res, 400, 'Missing object id');

      const etag = `"sha256:${sha}"`;
      const inm = (req.headers['if-none-match'] ?? '').toString();
      if (inm && inm.split(',').map(s => s.trim()).includes(etag)) {
        res.writeHead(304, { etag });
        return res.end();
      }

      const ae = (req.headers['accept-encoding'] ?? '').toString();
      if (ae && !ae.includes('br') && !ae.includes('*')) {
        return sendText(res, 406, 'Not Acceptable (need br)');
      }

      const obj = await cas.openObjectStream(sha);
      if (!obj) return sendText(res, 404, 'Not found');

      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-encoding': 'br',
        etag,
        'cache-control': 'public, max-age=31536000, immutable',
      });
      obj.pipe(res);
      return;
    }

    if (method === 'GET' && path.startsWith('/refs/')) {
      const name = path.split('/')[2] ?? '';
      if (!name) return sendText(res, 400, 'Missing ref name');
      const v = await cas.readRef(name);
      if (!v) return sendText(res, 404, 'Not found');
      return sendText(res, 200, v);
    }

    return sendText(res, 404, 'Not found');
  } catch (err) {
    console.error(err);
    return sendText(res, 500, 'Internal Server Error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Listening on http://${HOST}:${PORT}`);
  console.log(`Docs: http://${HOST}:${PORT}/apidocs`);
  console.log(`Store dir: ${ROOT}`);
});
