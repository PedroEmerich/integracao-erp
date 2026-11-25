// Gera as capturas de tela do portfólio em docs/screenshots/.
// Uso: npm run screenshots   (faz o build se ainda não existir dist/)
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'docs/screenshots');
mkdirSync(out, { recursive: true });

if (!existsSync(resolve(root, 'dist/index.html'))) {
  console.log('› Gerando build…');
  execSync('npm run build', { cwd: root, stdio: 'inherit' });
}

const server = await preview({ root, preview: { port: 4179, strictPort: true, open: false }, logLevel: 'warn' });
const base = 'http://localhost:4179/';

async function launch() {
  try {
    return await chromium.launch();
  } catch (e) {
    // Ambientes com Chromium pré-instalado em outro caminho.
    const alt = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
    console.warn('› Chromium padrão do Playwright indisponível, tentando', alt);
    return chromium.launch({ executablePath: alt });
  }
}

const browser = await launch();
const HIDE_TOASTS = '.toasts{display:none!important}';

async function newSession(viewport, theme = 'light') {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: theme });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('Erro na página:', e.message));
  await page.goto(base + '#/login');
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem('integra-hub-theme', t);
  }, theme);
  await page.reload();
  await page.addStyleTag({ content: HIDE_TOASTS });
  return { context, page };
}

async function go(page, route, wait = 900) {
  await page.goto(base + '#/' + route);
  await page.addStyleTag({ content: HIDE_TOASTS });
  await page.waitForTimeout(wait);
}

async function shot(page, name) {
  await page.screenshot({ path: resolve(out, name) });
  console.log('✓', name);
}

const desktop = { width: 1440, height: 900 };

// ---------- Desktop, tema claro ----------
{
  const { context, page } = await newSession(desktop);
  await shot(page, '00-login.png');
  await page.click('text=Entrar como Administrador');
  await page.waitForTimeout(1400);
  await shot(page, '01-dashboard.png');

  await go(page, 'integracoes');
  await shot(page, '02-integracoes.png');

  // Fila filtrada em erro, com o item aberto.
  await go(page, 'fila?status=error');
  await page.click('table tbody tr:has-text("CNPJ/CPF inválido") a');
  await page.waitForTimeout(600);
  await page.click('text=Corrigir dado').catch(() => undefined);
  await page.waitForTimeout(300);
  await shot(page, '03-fila-erro-aberto.png');

  // Linha do tempo de um item reprocessado depois de retentativas.
  const reprocessed = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('integra-hub-data') ?? '{}').state;
    return s?.jobs?.find((j) => j.status === 'reprocessed')?.id;
  });
  await go(page, `fila/${reprocessed}`, 700);
  await page.evaluate(() => document.querySelector('#tl-h')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await shot(page, '04-linha-do-tempo.png');

  await go(page, 'mapeamento');
  await shot(page, '05-mapeamento.png');

  await go(page, 'importacao');
  await page.click('text=Usar a planilha de exemplo agora');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const rows = document.querySelectorAll('tr.row-error');
    rows[0]?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(300);
  await shot(page, '06-importacao-validacao.png');

  await go(page, 'conciliacao');
  await page.click('role=tab[name=/Divergências/]');
  await page.waitForTimeout(300);
  await page.click('role=tab[name=/Sugestões/]');
  await page.waitForTimeout(300);
  await shot(page, '07-conciliacao.png');

  await go(page, 'alertas');
  await shot(page, '08-alertas.png');

  await go(page, 'auditoria');
  await shot(page, '09-auditoria.png');
  await context.close();
}

// ---------- Desktop, tema escuro, com o simulador ao vivo ----------
{
  const { context, page } = await newSession(desktop, 'dark');
  await page.click('text=Entrar como Administrador');
  await page.waitForTimeout(800);
  await page.click('.live-pill .switch');
  await page.waitForTimeout(9000);
  await shot(page, '10-tema-escuro-ao-vivo.png');
  await context.close();
}

// ---------- Celular 390×844 ----------
{
  const { context, page } = await newSession({ width: 390, height: 844 });
  await page.click('text=Entrar como Operador');
  await page.waitForTimeout(1400);
  await shot(page, '11-celular-dashboard.png');
  await go(page, 'erros');
  await shot(page, '12-celular-erros.png');
  await context.close();
}

await browser.close();
await new Promise((r) => server.httpServer.close(r));
console.log(`\nCapturas salvas em ${out}`);
