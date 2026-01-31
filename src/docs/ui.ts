export const APIDOCS_HTML = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Web-native CAS API Docs</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; }
    h1 { margin-top: 0; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    pre { background:#f6f8fa; padding:12px; overflow:auto; }
    .row { display:flex; gap:24px; flex-wrap: wrap; }
    .card { border:1px solid #ddd; border-radius: 10px; padding:16px; min-width: 320px; flex:1; }
    input[type="text"] { width: 100%; padding:8px; }
    button { padding:8px 12px; }
    .muted { color:#666; font-size: 0.9em; }
    .ok { color: #0a7; }
    .err { color: #c00; }
  </style>
</head>
<body>
  <h1>Web-native Content Addressable Storage API Docs</h1>
  <p class="muted">OpenAPI: <a href="/openapi.yaml">openapi.yaml</a> / <a href="/openapi.json">openapi.json</a></p>

  <div class="row">
    <div class="card">
      <h2>ZIP アップロード</h2>
      <p class="muted">POST /filesets (Content-Type: application/zip)</p>
      <input id="zip" type="file" accept=".zip" />
      <div style="margin-top:10px;">
        <button id="uploadBtn">アップロード</button>
      </div>
      <p id="uploadStatus" class="muted"></p>
      <pre id="uploadOut"></pre>
    </div>

    <div class="card">
      <h2>fileset 取得</h2>
      <p class="muted">GET /filesets/{filesetId}</p>
      <input id="filesetId" type="text" placeholder="filesetId を入力" />
      <div style="margin-top:10px;">
        <button id="getFilesetBtn">取得</button>
      </div>
      <p id="filesetStatus" class="muted"></p>
      <pre id="filesetOut"></pre>
    </div>

    <div class="card">
      <h2>object 取得（br）</h2>
      <p class="muted">GET /objects/{sha256} (Accept-Encoding: br)</p>
      <input id="objId" type="text" placeholder="sha256 を入力" />
      <div style="margin-top:10px;">
        <button id="getObjBtn">取得</button>
      </div>
      <p id="objStatus" class="muted"></p>
      <pre id="objOut"></pre>
    </div>
  </div>

  <h2>OpenAPI (YAML)</h2>
  <pre id="spec"></pre>

<script>
  const $ = (id) => document.getElementById(id);

  async function loadSpec() {
    const t = await fetch('/openapi.yaml').then(r => r.text());
    $('spec').textContent = t;
  }
  loadSpec();

  $('uploadBtn').onclick = async () => {
    const f = $('zip').files[0];
    if (!f) return;
    $('uploadStatus').textContent = 'Uploading...';
    $('uploadOut').textContent = '';
    try {
      const res = await fetch('/filesets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip', 'Accept': 'application/json' },
        body: await f.arrayBuffer(),
      });
      const text = await res.text();
      $('uploadStatus').innerHTML = res.ok ? '<span class="ok">OK</span>' : '<span class="err">ERROR</span>';
      $('uploadOut').textContent = text;
      if (res.ok) {
        try {
          const json = JSON.parse(text);
          if (json.filesetId) $('filesetId').value = json.filesetId;
        } catch {}
      }
    } catch (e) {
      $('uploadStatus').innerHTML = '<span class="err">ERROR</span>';
      $('uploadOut').textContent = String(e);
    }
  };

  $('getFilesetBtn').onclick = async () => {
    const id = $('filesetId').value.trim();
    if (!id) return;
    $('filesetStatus').textContent = 'Fetching...';
    $('filesetOut').textContent = '';
    try {
      const res = await fetch('/filesets/' + encodeURIComponent(id), { headers: { 'Accept': 'application/json' }});
      const text = await res.text();
      $('filesetStatus').innerHTML = res.ok ? '<span class="ok">OK</span>' : '<span class="err">ERROR</span>';
      $('filesetOut').textContent = text;
    } catch (e) {
      $('filesetStatus').innerHTML = '<span class="err">ERROR</span>';
      $('filesetOut').textContent = String(e);
    }
  };

  $('getObjBtn').onclick = async () => {
    const id = $('objId').value.trim();
    if (!id) return;
    $('objStatus').textContent = 'Fetching...';
    $('objOut').textContent = '';
    try {
      const res = await fetch('/objects/' + encodeURIComponent(id), {
        headers: {
          'Accept': 'application/octet-stream',
          'Accept-Encoding': 'br'
        }
      });
      if (!res.ok) {
        const t = await res.text();
        $('objStatus').innerHTML = '<span class="err">ERROR</span>';
        $('objOut').textContent = t;
        return;
      }
      // Browser will transparently decode br if supported.
      const buf = await res.arrayBuffer();
      const u8 = new Uint8Array(buf);
      // Show first bytes as hex + try UTF-8 preview.
      const hex = Array.from(u8.slice(0, 64)).map(b => b.toString(16).padStart(2,'0')).join(' ');
      let preview = '';
      try { preview = new TextDecoder('utf-8', { fatal: false }).decode(u8.slice(0, 2048)); } catch {}
      $('objStatus').innerHTML = '<span class="ok">OK</span>';
      $('objOut').textContent = \`bytes=\${u8.length}
hex(0..63): \${hex}

utf8 preview:
\${preview}\`;
    } catch (e) {
      $('objStatus').innerHTML = '<span class="err">ERROR</span>';
      $('objOut').textContent = String(e);
    }
  };
</script>
</body>
</html>
`;
