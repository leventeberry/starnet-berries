/* STARNET — windows/figma.js (starnet-berries): the FIGMA viewer window.
   Paste any figma.com design / FigJam / prototype / slides link and it opens here through Figma's Embed Kit 2.0
   (https://embed.figma.com/...). The Embed API needs the station's Figma OAuth app CLIENT ID (public; served by
   GET /api/figma/embed — the secret never leaves the server) and this site registered as an embed origin in that
   app. The iframe is cross-origin, so it can never reach the page's token. Files follow their Figma sharing
   settings: a private file shows Figma's own login inside the frame.
   Loads AFTER stationui.js (see index.html) and registers itself via StationUI.registerWindow. */
'use strict';
(() => {
  if (typeof StationUI === 'undefined' || !StationUI.registerWindow) return;
  const esc = StationUI.h.esc;
  const LAST_KEY = 'starnet.figma.last';
  const FIGMA_ORIGINS = ['https://www.figma.com', 'https://embed.figma.com'];
  let config = null, onMessage = null;

  // figma.com link -> embed URL, or null when it is not a Figma file link
  function embedUrl(raw, cfg) {
    let u;
    try { u = new URL(String(raw || '').trim()); } catch (_) { return null; }
    if (u.protocol !== 'https:' || !/^(www\.|embed\.)?figma\.com$/.test(u.hostname)) return null;
    const m = /^\/(file|design|board|proto|slides|deck)\/([A-Za-z0-9]+)(\/[^?#]*)?$/.exec(u.pathname);
    if (!m) return null;
    const out = new URL('https://embed.figma.com/' + (m[1] === 'file' ? 'design' : m[1]) + '/' + m[2] + (m[3] || ''));
    u.searchParams.forEach((v, k) => { if (!/^(embed-host|client-id|embed_host)$/.test(k)) out.searchParams.set(k, v); });
    out.searchParams.set('embed-host', (cfg && cfg.embedHost) || 'starnet');
    if (cfg && cfg.clientId) out.searchParams.set('client-id', cfg.clientId);
    if (!out.searchParams.has('theme')) out.searchParams.set('theme', 'system');
    return out.href;
  }

  async function loadConfig() {
    if (config) return config;
    try { config = await Harness.api.get('/api/figma/embed', { timeoutMs: 10000 }); } catch (_) { config = { clientId: '', embedHost: 'starnet' }; }
    return config;
  }

  function buildFigma(body) {
    let last = '';
    try { last = localStorage.getItem(LAST_KEY) || ''; } catch (_) {}
    body.innerHTML = '<div class="gx" style="display:flex;flex-direction:column;height:100%;min-height:420px;gap:8px;">'
      + '<form class="fg-bar" style="display:flex;gap:6px;">'
      + '<input class="fg-url" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Paste a figma.com link (design, FigJam, prototype, slides)" style="flex:1;min-width:0;" value="' + esc(last) + '">'
      + '<button type="submit" class="bb xs">OPEN</button></form>'
      + '<div class="fg-note dim" style="min-height:1.2em;"></div>'
      + '<iframe class="fg-frame" title="Figma file" allow="fullscreen; clipboard-write" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="flex:1;width:100%;min-height:360px;border:0;border-radius:6px;background:#1e1e1e;" hidden></iframe>'
      + '</div>';
    const form = body.querySelector('.fg-bar'), input = body.querySelector('.fg-url');
    const note = body.querySelector('.fg-note'), frame = body.querySelector('.fg-frame');
    const say = t => { note.textContent = t || ''; };

    async function open(raw) {
      const cfg = await loadConfig();
      const src = embedUrl(raw, cfg);
      if (!src) { say('That is not a Figma file link. Copy it from Figma with Share › Copy link.'); return; }
      try { localStorage.setItem(LAST_KEY, String(raw).trim()); } catch (_) {}
      say(cfg.clientId ? '' : 'Showing the file without the Embed API (no Figma client ID is set on this server).');
      frame.hidden = false;
      frame.src = src;
    }
    form.addEventListener('submit', ev => { ev.preventDefault(); open(input.value); });

    if (onMessage) window.removeEventListener('message', onMessage);
    onMessage = ev => {
      if (FIGMA_ORIGINS.indexOf(ev.origin) < 0 || ev.source !== frame.contentWindow) return;
      const type = ev.data && ev.data.type;
      if (type === 'LOGIN_SCREEN_SHOWN') say('This file is private: log in to Figma inside the frame to view it.');
      else if (type === 'PASSWORD_SCREEN_SHOWN') say('This file is password-protected: enter its password inside the frame.');
      else if (type === 'INITIAL_LOAD') say('');
    };
    window.addEventListener('message', onMessage);
    if (last) open(last);
  }

  StationUI.registerWindow('figma', 'FIGMA', buildFigma, { wide: true, className: 'figma-win',
    onClose: () => { if (onMessage) window.removeEventListener('message', onMessage); onMessage = null; } });
  if (typeof window !== 'undefined') window.StarnetFigmaEmbed = { embedUrl };   // for tests
})();
