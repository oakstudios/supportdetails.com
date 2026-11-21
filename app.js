/* Browser and operating system */

const ua = navigator.userAgent;
const set = (id, value) => {
  document.getElementById(id).textContent = value;
};

// Match browser-specific tokens before shared Chromium and Safari tokens.

const browserPatterns = [
  ['Edge', /(?:EdgA|EdgiOS|Edg)\/([\d.]+)/],
  ['Opera', /(?:OPR|OPiOS)\/([\d.]+)/],
  ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
  ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
  ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
  ['Safari', /Version\/([\d.]+).*Safari/]
];

const browser = browserPatterns.find(([, pattern]) => pattern.test(ua));
set('browser', browser ? browser[0] + ' ' + ua.match(browser[1])[1] : 'Unknown browser');

function operatingSystem() {
  const isIPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (isIPad || /iPad|iPhone|iPod/.test(ua)) return 'iOS / iPadOS';

  // Safari and some Chromium versions report a compatibility version here.
  const platform = navigator.userAgentData?.platform;
  const macVersion = ua.match(/Mac OS X (\d+(?:[_.]\d+)+)/);
  if (macVersion && (!platform || platform === 'macOS')) {
    return 'OS X ' + macVersion[1].replaceAll('_', '.');
  }
  if (platform) return platform;

  const platforms = [
    [/Android/, 'Android'],
    [/CrOS/, 'ChromeOS'],
    [/Windows/, 'Windows'],
    [/Mac OS X/, 'macOS'],
    [/Linux/, 'Linux']
  ];
  return platforms.find(([pattern]) => pattern.test(ua))?.[1] ?? 'Unknown';
}

/* Browser capabilities */

set('os', operatingSystem());
set('ua', ua || 'Unavailable');
set('language', navigator.language || 'Unavailable');
set('websocket', typeof WebSocket === 'function' ? 'Yes' : 'No');

try {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  set('webgl', gl ? 'Yes' : 'No');
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
} catch {
  set('webgl', 'Unavailable');
}

/* Ad blocking */

// EasyList hides #ad-banner-top and blocks /admanager.js as a script.
function checkAdBlocking() {
  set('adblock', 'Checking…');

  const bait = document.createElement('div');
  bait.id = 'ad-banner-top';
  bait.className = 'adblock-probe adsbox ad-banner adsbygoogle';
  bait.setAttribute('aria-hidden', 'true');
  document.body.append(bait);

  const probe = document.createElement('script');
  let scriptResult;
  let timer;

  function finish(result) {
    clearTimeout(timer);
    bait.remove();
    probe.remove();
    set('adblock', result);
  }

  function updateResult() {
    const style = getComputedStyle(bait);
    const hidden = !bait.offsetHeight || style.visibility === 'hidden' || style.display === 'none';

    if (hidden || scriptResult === 'blocked') {
      finish('Yes (estimated)');
    } else if (scriptResult === 'loaded') {
      finish('No (estimated)');
    } else {
      finish('Unavailable');
    }
  }

  // Keep the element in the DOM briefly so extensions can apply hiding rules.
  const checkAfter = performance.now() + 600;
  function scriptFinished(result) {
    scriptResult = result;
    clearTimeout(timer);
    timer = setTimeout(updateResult, Math.max(0, checkAfter - performance.now()));
  }

  timer = setTimeout(updateResult, 3500);
  if (location.protocol === 'file:') {
    scriptFinished('loaded');
    return;
  }

  probe.src = './admanager.js';
  probe.onload = () => scriptFinished('loaded');
  probe.onerror = () => scriptFinished(navigator.onLine ? 'blocked' : 'unavailable');
  document.head.append(probe);
}

checkAdBlocking();

set('javascript', 'Yes');
set('cookies', navigator.cookieEnabled ? 'Yes' : 'No');

/* Screen and viewport */

const dimensions = (width, height) => width + ' × ' + height + ' px';

function updateDimensions() {
  const density = devicePixelRatio >= 2 ? (/Mac|iPhone|iPad|iPod/.test(ua) ? ' (Retina)' : ' (high DPI)') : '';
  set('resolution', dimensions(screen.width, screen.height) + density);
  set('viewport', dimensions(innerWidth, innerHeight));
  set('depth', screen.colorDepth + ' bit');
}

updateDimensions();
addEventListener('resize', updateDimensions);

/* IP address */

// Cloudflare serves this endpoint on proxied hosts. Other hosts may report Unavailable.
if (location.protocol === 'https:') {
  fetch('/cdn-cgi/trace', {signal: AbortSignal.timeout(4500)})
    .then(response => response.ok ? response.text() : '')
    .then(trace => {
      const ip = trace.match(/^ip=([\da-f:.]+)$/im);
      if (ip) set('ip', ip[1]);
    })
    .catch(() => {});
}

/* Export helpers */

const reportRows = () => Array.from(document.querySelectorAll('.report dt'), label => [
  label.textContent, label.nextElementSibling.textContent
]);

let exportStatusTimer;

function showExportStatus(message) {
  clearTimeout(exportStatusTimer);
  set('export-status', message);
  exportStatusTimer = setTimeout(() => set('export-status', ''), 4000);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showExportStatus(filename + ' download started.');
}

/* Export buttons */

document.getElementById('csv').addEventListener('click', () => {
  const rows = [['Detail', 'Value'], ...reportRows()];
  const quote = value => '"' + value.replaceAll('"', '""') + '"';
  const csv = rows.map(row => row.map(quote).join(',')).join('\r\n');
  download(new Blob(['\uFEFF', csv, '\r\n'], {type:'text/csv;charset=utf-8'}), 'support-details.csv');
});

const pngButton = document.getElementById('png');
pngButton.addEventListener('click', async () => {
  pngButton.disabled = true;
  try {
    const scale = Math.min(2, devicePixelRatio);
    const canvas = await html2canvas(document.querySelector('main'), {
      backgroundColor: '#f7f9fd',
      logging: false,
      scale,
      ignoreElements: element => element.id === 'export-status' || element.tagName === 'FOOTER',
      // Keep the header layout while hiding export controls in the image.
      onclone: doc => {
        doc.getElementById('actions').style.visibility = 'hidden';
      }
    });
    const padding = 24 * scale;
    const image = document.createElement('canvas');
    image.width = canvas.width + Math.ceil(padding * 2);
    image.height = canvas.height + Math.ceil(padding * 2);
    const context = image.getContext('2d');
    context.fillStyle = '#f7f9fd';
    context.fillRect(0, 0, image.width, image.height);
    context.drawImage(canvas, padding, padding);
    const blob = await new Promise(resolve => image.toBlob(resolve, 'image/png'));
    if (blob) download(blob, 'support-details.png');
    else showExportStatus('PNG export failed.');
  } catch {
    showExportStatus('PNG export failed.');
  } finally {
    pngButton.disabled = false;
  }
});

document.getElementById('actions').hidden = false;
