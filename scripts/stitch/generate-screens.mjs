// Genera en Google Stitch (MCP remoto) una propuesta por pantalla de
// docs/pantallas.md y guarda HTML + captura en docs/stitch/ (copiado de jc-attendance).
//
// Credencial (una de las dos, como variable de entorno; nunca en el repo):
//   STITCH_API_KEY       → header X-Goog-Api-Key
//   STITCH_ACCESS_TOKEN  → header Authorization: Bearer (p. ej. `gcloud auth print-access-token`)
//   STITCH_QUOTA_PROJECT → header x-goog-user-project; obligatorio con token de usuario
//
// Uso:
//   node scripts/stitch/generate-screens.mjs              # todas las pendientes
//   node scripts/stitch/generate-screens.mjs A4 C1        # solo esas
// Es reanudable: lo ya generado queda en docs/stitch/manifest.json y se salta.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const ENDPOINT = 'https://stitch.googleapis.com/mcp';
const root = resolve(new URL('../..', import.meta.url).pathname);
const outDir = join(root, 'docs', 'stitch');
const manifestPath = join(outDir, 'manifest.json');
const config = JSON.parse(readFileSync(join(root, 'scripts/stitch/screens.json'), 'utf8'));

const headers = { 'content-type': 'application/json', accept: 'application/json' };
if (process.env.STITCH_API_KEY) headers['X-Goog-Api-Key'] = process.env.STITCH_API_KEY;
else if (process.env.STITCH_ACCESS_TOKEN) headers.authorization = `Bearer ${process.env.STITCH_ACCESS_TOKEN}`;
else {
  console.error('Falta STITCH_API_KEY o STITCH_ACCESS_TOKEN.');
  process.exit(1);
}
// Con token de usuario (gcloud), Stitch exige el proyecto de Google Cloud al que se carga la cuota.
if (process.env.STITCH_QUOTA_PROJECT) headers['x-goog-user-project'] = process.env.STITCH_QUOTA_PROJECT;

let rpcId = 0;
async function call(name, args, timeoutMs = 600_000) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${name}: ${JSON.stringify(body.error)}`);
  const { content = [], structuredContent, isError } = body.result ?? {};
  const text = content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  if (isError) throw new Error(`${name}: ${text}`);
  if (structuredContent) return structuredContent;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const findScreens = (obj) => {
  // Las respuestas anidan las pantallas en distintos sitios; se buscan objetos con html_code o screenshot.
  const found = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (typeof o.name === 'string' && o.name.includes('/screens/')) found.push(o);
    Object.values(o).forEach(walk);
  };
  walk(obj);
  return found;
};

async function download(fileName, target) {
  const file = await call('download_file', { name: fileName }, 120_000);
  if (file.html) writeFileSync(target, file.html);
  else if (file.image) writeFileSync(target, Buffer.from(file.image, 'base64'));
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { screens: {} };

  if (!manifest.projectId) {
    const project = await call('create_project', { title: config.projectTitle });
    manifest.projectId = String(project.name ?? project.projectId ?? '').replace(/^projects\//, '');
    if (!manifest.projectId) throw new Error(`create_project sin id: ${JSON.stringify(project)}`);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Proyecto creado: ${manifest.projectId}`);
  }

  const only = process.argv.slice(2);
  const pending = config.screens.filter((s) => (only.length ? only.includes(s.id) : !manifest.screens[s.id]));

  for (const screen of pending) {
    console.log(`→ ${screen.id} ${screen.name} (${screen.deviceType})`);
    const before = new Set(findScreens(await call('list_screens', { projectId: manifest.projectId })).map((s) => s.name));
    const args = {
      projectId: manifest.projectId,
      deviceType: screen.deviceType,
      prompt: `${config.promptPrefix}\n\nPantalla ${screen.id} · ${screen.name} (ruta ${screen.route}).\n${screen.prompt}`,
    };
    if (manifest.designSystem) args.designSystem = manifest.designSystem;

    let created;
    try {
      const out = await call('generate_screen_from_text', args);
      created = findScreens(out).find((s) => !before.has(s.name));
      const ds = JSON.stringify(out).match(/assets\/\d+/);
      if (!manifest.designSystem && ds) manifest.designSystem = ds[0];
    } catch (err) {
      console.warn(`  generación sin respuesta (${err.message}); se consulta la lista de pantallas`);
    }
    // Según la documentación de la herramienta: no reintentar; consultar cada 30 s hasta 10 veces.
    for (let i = 0; !created && i < 10; i++) {
      await sleep(30_000);
      created = findScreens(await call('list_screens', { projectId: manifest.projectId })).find((s) => !before.has(s.name));
    }
    if (!created) {
      console.warn(`  ${screen.id}: no apareció la pantalla; se deja pendiente`);
      continue;
    }

    if (!manifest.designSystem) {
      // La generación puede no devolver respuesta (corte del proxy); el sistema de diseño se lee del proyecto.
      const ds = JSON.stringify(await call('list_design_systems', { projectId: manifest.projectId })).match(/assets\/\d+/);
      if (ds) manifest.designSystem = ds[0];
    }
    const detail = await call('get_screen', { name: created.name });
    const htmlName = detail.html_code?.name ?? detail.htmlCode?.name;
    const shotName = detail.screenshot?.name;
    if (htmlName) await download(htmlName, join(outDir, `${screen.id}.html`));
    if (shotName) await download(shotName, join(outDir, `${screen.id}.png`));
    manifest.screens[screen.id] = { name: screen.name, screen: created.name, generatedAt: new Date().toISOString() };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`  ✓ ${created.name}`);
  }
  console.log(`Proyecto: https://stitch.withgoogle.com/projects/${manifest.projectId}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
