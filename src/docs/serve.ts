import http from 'node:http';
import { OPENAPI_JSON, OPENAPI_YAML } from './openapi.js';

export function serveOpenApi(req: http.IncomingMessage, res: http.ServerResponse, path: string): boolean {
  if (req.method !== 'GET') return false;

  if (path === '/openapi.yaml') {
    const body = OPENAPI_YAML;
    res.writeHead(200, {
      'content-type': 'application/yaml; charset=utf-8',
      'content-length': Buffer.byteLength(body).toString(),
      'cache-control': 'no-store',
    });
    res.end(body);
    return true;
  }

  if (path === '/openapi.json') {
    const body = JSON.stringify(OPENAPI_JSON, null, 2);
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body).toString(),
      'cache-control': 'no-store',
    });
    res.end(body);
    return true;
  }

  return false;
}

export function serveApiDocsHtml(req: http.IncomingMessage, res: http.ServerResponse, path: string, html: string): boolean {
  if (req.method === 'GET' && path === '/apidocs') {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': Buffer.byteLength(html).toString(),
      'cache-control': 'no-store',
    });
    res.end(html);
    return true;
  }
  return false;
}
