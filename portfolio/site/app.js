import { profile, projects, alsoBuilt } from './content.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- content ----------
$('#hero-role').textContent = profile.role + (profile.location ? ` · ${profile.location}` : '');
$('#hero-headline').textContent = profile.headline;
$('#about-start').innerHTML = profile.start.map((p) => `<p>${esc(p)}</p>`).join('');
$('#loves').innerHTML = profile.loves.map((l) => `<li><b>${esc(l.title)}</b><span>${esc(l.text)}</span></li>`).join('');
$('#skills').innerHTML = profile.skills.map((s) => `<li>${esc(s)}</li>`).join('');
$('#year').textContent = new Date().getFullYear();
$('#footer-links').innerHTML = [
  profile.github && `<a href="${esc(profile.github)}" target="_blank" rel="noopener">GitHub</a>`,
  profile.linkedin && `<a href="${esc(profile.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>`,
].filter(Boolean).join('');

$('#work-grid').innerHTML = projects.map((p, i) => `
  <button class="proj reveal" style="--c:${p.color}" data-project="${p.id}">
    <span class="num">0${i + 1} /</span>
    <span class="tag">${esc(p.tag)}</span><h3>${esc(p.name)}</h3><p>${esc(p.summary)}</p>
    <span class="ai-line"><b>AI</b> ${esc(p.aiShort)}</span>
    <span class="go">How it was built</span>
  </button>`).join('');
$('#also-list').innerHTML = alsoBuilt.map((x) => `<li>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a>` : `<b>${esc(x.name)}</b>`}<span>${esc(x.text)}</span></li>`).join('');

// ---------- api ----------
async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ ok: false, error: 'The server sent something unexpected.' }));
  return { status: res.status, ...data };
}
const formData = (form) => Object.fromEntries(new FormData(form).entries());
const busy = (btn, on, label) => { btn.disabled = on; if (label) btn.textContent = label; };

let status = { leads: false, audit: { ai: false }, cover: { ai: false }, contactEmail: '' };
fetch('/api/status').then((r) => r.json()).then((s) => {
  status = s;
  const live = s.leads || s.audit?.ai;
  $('#agent-status').textContent = live ? 'Agents online' : 'Agents warming up';
  $('#agent-pulse').classList.toggle('is-off', !live);
}).catch(() => {
  $('#agent-status').textContent = 'Agents offline (preview)';
  $('#agent-pulse').classList.add('is-off');
});

function mailtoFallback(email, subject, text) {
  if (!email) return false;
  location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  return true;
}

// ---------- project sheet ----------
const sheet = $('#sheet');
export function openProject(id) {
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  sheet.style.setProperty('--c', p.color);
  $('#sheet-tag').textContent = p.tag;
  $('#sheet-title').textContent = p.name;
  $('#sheet-summary').textContent = p.summary;
  $('#sheet-ai').textContent = p.ai;
  $('#sheet-stack').innerHTML = p.stack.map((x) => `<span>${esc(x)}</span>`).join('');
  const link = $('#sheet-link');
  link.hidden = !p.url;
  if (p.url) { link.href = p.url; link.textContent = `Visit ${p.linkLabel || p.name} ↗`; }
  sheet.showModal();
  scene?.pulse(id);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-project]');
  if (b) openProject(b.dataset.project);
});
$('#sheet-close').addEventListener('click', () => sheet.close());
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); }); // tap outside

// ---------- contact ----------
const contactForm = $('#contact-form');
contactForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const note = $('.form-note', contactForm);
  const btn = $('button[type=submit]', contactForm);
  const data = formData(contactForm);
  if (!data.name || !data.email || !data.message) { note.className = 'form-note err'; note.textContent = 'Name, email and a message, please.'; return; }
  busy(btn, true, 'Sending…');
  const r = await post('/api/lead', { jobType: 'general', ...data });
  if (r.ok) {
    note.className = 'form-note ok';
    note.textContent = 'Message received. You\'ll hear from me soon.';
    contactForm.reset();
    busy(btn, false, 'Send');
  } else {
    busy(btn, false, 'Send');
    note.className = 'form-note err';
    note.textContent = r.error || 'That did not go through.';
    if (r.fallbackEmail) setTimeout(() => mailtoFallback(r.fallbackEmail, `Hello from ${data.name}`, `${data.message}\n\n— ${data.name} (${data.email})`), 1200);
  }
});

// ---------- lab tabs ----------
const tabs = [['#t-audit', '#tab-audit'], ['#t-cover', '#tab-cover']];
tabs.forEach(([t, p]) => $(t).addEventListener('click', () => {
  for (const [t2, p2] of tabs) {
    const on = t2 === t;
    $(t2).classList.toggle('is-active', on); $(t2).setAttribute('aria-selected', on);
    $(p2).hidden = !on;
  }
}));

const thinking = (msg) => `<div class="thinking"><span class="orbit"></span><span>${esc(msg)}</span></div>`;
const errBox = (msg) => `<div class="err-box">${esc(msg)}</div>`;

// ---------- audit ----------
const auditForm = $('#audit-form');
const auditOut = $('#audit-out');
let lastAudit = null;
auditForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = formData(auditForm);
  if (!data.url) { auditOut.innerHTML = errBox('Enter a site address first.'); return; }
  const btn = $('button', auditForm);
  busy(btn, true, 'Reviewing…');
  auditOut.innerHTML = thinking('Fetching the page and running checks…');
  const steps = ['Timing the server…', 'Reading SEO tags…', 'Checking security headers…', 'Asking the agent for fixes…'];
  let i = 0; const iv = setInterval(() => { const s = $('.thinking span:last-child', auditOut); if (s && i < steps.length) s.textContent = steps[i++]; }, 1400);
  const r = await post('/api/audit', data);
  clearInterval(iv);
  busy(btn, false, 'Review my site');
  if (!r.ok) { auditOut.innerHTML = errBox(r.error || 'The audit failed.'); return; }
  lastAudit = r.report;
  renderAudit(r.report);
});

const checkHtml = (k) => `
  <li class="check ${k.pass ? 'pass' : 'fail'}"><span class="i">${k.pass ? '✓' : '!'}</span>
    <div><span class="g">${esc(k.group)}</span><br><b>${esc(k.label)}</b><small>${esc(k.detail)}</small></div></li>`;

function renderAudit(rep) {
  const c = rep.score >= 80 ? 'var(--ok)' : rep.score >= 55 ? 'var(--gold)' : 'var(--bad)';
  const fails = rep.checks.filter((k) => !k.pass);
  const passes = rep.checks.filter((k) => k.pass);
  auditOut.innerHTML = `
    <div class="report-top">
      <div class="gauge" style="--c:${c}"><b>0</b></div>
      <div class="meta"><h3>${esc(rep.title || 'Untitled page')}</h3>
        <a href="${esc(rep.url)}" target="_blank" rel="noopener nofollow">${esc(rep.url)}</a>
        <div class="muted">${rep.checks.filter((x) => x.pass).length}/${rep.checks.length} checks passed · ${rep.timing.ttfb} ms first response</div></div>
    </div>
    ${fails.length ? `<ul class="checks">${fails.map(checkHtml).join('')}</ul>` : '<p class="muted">Every check passed. Nice.</p>'}
    ${passes.length ? `<details class="passed"><summary>${passes.length} checks passed</summary><ul class="checks">${passes.map(checkHtml).join('')}</ul></details>` : ''}
    ${rep.advice ? `<div class="advice"><h4>What the AI would fix first</h4>${esc(rep.advice)}</div>` : ''}
    <div class="followup">
      <p class="muted" style="margin:0">Want the full write-up? My agents will draft it and I'll send it to you.</p>
      <form class="row-form" id="audit-follow" novalidate>
        <input name="email" type="email" autocomplete="email" placeholder="you@business.com" required>
        <button class="btn btn-ghost" type="submit">Email me the report</button>
      </form>
      <p class="form-note" aria-live="polite"></p>
    </div>`;
  // animate the gauge
  const g = $('.gauge', auditOut); const b = $('b', g); let v = 0;
  const step = () => { v = Math.min(rep.score, v + Math.max(1, (rep.score - v) * 0.12)); g.style.setProperty('--v', v); b.textContent = Math.round(v); if (v < rep.score) requestAnimationFrame(step); };
  requestAnimationFrame(step);

  $('#audit-follow').addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = $('.followup .form-note', auditOut); const btn = $('button', e.target);
    const email = new FormData(e.target).get('email');
    busy(btn, true, 'Sending…');
    const r = await post('/api/audit', { url: lastAudit.url, email });
    busy(btn, false, 'Email me the report');
    if (r.ok && r.report.followUp === 'queued') { note.className = 'form-note ok'; note.textContent = 'Queued. My agent is writing the full report now.'; }
    else { note.className = 'form-note err'; note.textContent = r.error || 'The report agent is offline right now. Use the contact form below and I\'ll send it by hand.'; }
  });
}

// ---------- cover letter ----------
const coverForm = $('#cover-form');
const coverOut = $('#cover-out');
coverForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = formData(coverForm);
  if ((data.posting || '').trim().length < 80) { coverOut.innerHTML = errBox('Paste a bit more of the job post (a few sentences at least).'); return; }
  const btn = $('button[type=submit]', coverForm);
  busy(btn, true, 'Writing…');
  coverOut.innerHTML = thinking('Reading the post and matching it to my work…');
  const r = await post('/api/cover-letter', data);
  busy(btn, false, 'Check the fit');
  if (!r.ok) { coverOut.innerHTML = errBox(r.error || 'That did not work.'); return; }
  if (!r.letter) {
    coverOut.innerHTML = `<div class="advice"><h4>Sent to my agents</h4>The writing agent will draft this and I'll review it${data.email ? ' and email you' : ''}. Thanks for thinking of me.</div>`;
    return;
  }
  coverOut.innerHTML = `
    ${r.fit ? `<span class="fit ${esc(r.fit)}">${esc(r.fit)} fit</span>` : ''}
    <div class="letter"><h4>Why I'm a fit${data.company ? ` for ${esc(data.company)}` : ''}</h4>${esc(r.letter)}</div>
    ${r.picks?.length ? `<div class="picks">${r.picks.map((p) => `<div class="pick"><b>${esc(p.name)}</b><div class="muted">${esc(p.why)}</div></div>`).join('')}</div>` : ''}
    <div class="copy-row"><button class="btn btn-ghost" type="button" id="copy-letter">Copy letter</button>
      <a class="btn btn-primary" href="#contact">Talk to me</a></div>
    ${r.queued ? '<p class="muted" style="font-size:14px">A copy went to my inbox, so I\'ll see this too.</p>' : ''}`;
  $('#copy-letter').addEventListener('click', async (ev) => {
    try { await navigator.clipboard.writeText(r.letter); ev.target.textContent = 'Copied ✓'; } catch { ev.target.textContent = 'Copy failed'; }
  });
});

// ---------- nav + reveal ----------
const nav = $('#nav');
const onScroll = () => {
  nav.classList.toggle('is-solid', scrollY > 40);
  $('#hero-hint').style.opacity = scrollY > 40 ? 0 : '';
};
addEventListener('scroll', onScroll, { passive: true });
onScroll();
const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { threshold: 0.12 });
document.querySelectorAll('.panel, .section-head, .reveal').forEach((el) => { el.classList.add('reveal'); io.observe(el); });

// ---------- 3D (loaded last so the page works even if WebGL doesn't) ----------
let scene = null;
const label = $('#node-label');
function showLabel(id, x, y) {
  const svc = projects.find((s) => s.id === id);
  if (!svc) { label.hidden = true; return; }
  label.textContent = svc.name;
  label.style.left = `${x}px`; label.style.top = `${y}px`; label.style.borderColor = svc.color;
  label.hidden = false;
}
try {
  const { createScene } = await import('./scene.js');
  scene = createScene($('#scene'), {
    nodes: projects,
    onSelect: (id) => { label.hidden = true; openProject(id); },
    onHover: (id, x, y) => (id ? showLabel(id, x, y) : (label.hidden = true)),
  });
} catch (err) {
  console.warn('3D scene unavailable:', err);
  $('#hero-hint').hidden = true;
  document.body.style.background = 'radial-gradient(80% 60% at 70% 30%, #2a0f2a, #05060f 70%)';
}
