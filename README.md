# Web-native CAS sample — v3.2 (OpenAPI + /apidocs)

CAS (Content-Addressable Storage): object ID is derived from content hash (sha256).

- No Express
- No runtime deps (dev deps only: TypeScript + @types/node)
- Node.js 20+ (ESM)

Adds:

- `GET /openapi.yaml`
- `GET /openapi.json`
- `GET /apidocs` : a tiny HTML UI to view the spec + upload ZIP and test endpoints

The server still implements Plan 3 (C1): stream processing + spool + central directory finalization.

## Run

```bash
npm install
npm run build
npm start
```

Open:
- http://127.0.0.1:8787/apidocs

## Notes

- API uses brotli stored objects. `GET /objects/{sha256}` returns brotli bytes when the client accepts `br`.
- Range is intentionally not supported.

### Env

- `STORE_DIR` (default `./store`)
- `KEEP_SPOOL=1` keep the temporary uploaded ZIP (debug)
