import { profile, services, projects } from './content.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- content ----------
$('#hero-role').textContent = profile.role + (profile.location ? ` · ${profile.location}` : '');
$('#hero-headline').textContent = profile.headline;
$('#about-intro').textContent = profile.intro;
$('#skills').innerHTML = profile.skills.map((s) => `<li>${esc(s)}</li>`).join('');
$('#year').textContent = new Date().getFullYear();
$('#footer-links').innerHTML = [
  profile.github && `<a href="${esc(profile.github)}" target="_blank" rel="noopener">GitHub</a>`,
  profile.linkedin && `<a href="${esc(profile.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>`,
].filter(Boolean).join('');

$('#service-grid').innerHTML = services.map((s) => `
  <button class="svc reveal" style="--c:${s.color}" data-service="${s.id}">
    <h3>${esc(s.title)}</h3><p>${esc(s.blurb)}</p><span class="go">Start a brief</span>
  </button>`).join('');

$('#work-grid').innerHTML = projects.map((p) => {
  const tag = p.url ? 'a' : 'article';
  const href = p.url ? ` href="${esc(p.url)}" target="_blank" rel="noopener"` : '';
  return `<${tag} class="proj reveal"${href}>
    <span class="tag">${esc(p.tag)}</span><h3>${esc(p.name)}</h3><p>${esc(p.summary)}</p>
    <div class="stack">${p.stack.map((x) => `<span>${esc(x)}</span>`).join('')}</div></${tag}>`;
}).join('');

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
  const live = s.leads || s.audit?.ai || s.cover?.ai;
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

// ---------- brief sheet ("hire me for X") ----------
const sheet = $('#brief');
const briefForm = $('#brief-form');
let currentService = null;

function fieldHtml(q) {
  const common = `name="${esc(q.name)}" placeholder="${esc(q.placeholder || '')}"`;
  let input;
  if (q.type === 'textarea') input = `<textarea ${common} rows="3"></textarea>`;
  else if (q.type === 'select') input = `<select name="${esc(q.name)}">${q.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`;
  else input = `<input ${common} type="${q.type === 'url' ? 'url' : 'text'}"${q.type === 'url' ? ' inputmode="url"' : ''}>`;
  return `<label>${esc(q.label)} ${input}</label>`;
}

export function openBrief(id) {
  const svc = services.find((s) => s.id === id);
  if (!svc) return;
  currentService = svc;
  sheet.style.setProperty('--c', svc.color);
  $('#brief-title').textContent = svc.title;
  $('#brief-blurb').textContent = svc.blurb;
  $('#brief-fields').innerHTML = `<div class="stack-form">${svc.questions.map(fieldHtml).join('')}</div>`;
  const note = $('.form-note', briefForm); note.textContent = ''; note.className = 'form-note';
  const btn = $('button[type=submit]', briefForm); busy(btn, false, 'Send brief'); btn.style.setProperty('--c', svc.color);
  sheet.showModal();
  scene?.pulse(id);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-service]');
  if (b) openBrief(b.dataset.service);
});
$('#brief-close').addEventListener('click', () => sheet.close());
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); }); // tap outside

briefForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const note = $('.form-note', briefForm);
  const btn = $('button[type=submit]', briefForm);
  const data = formData(briefForm);
  const answers = {};
  for (const q of currentService.questions) answers[q.name] = data[q.name] || '';
  if (!data.name || !data.email) { note.className = 'form-note err'; note.textContent = 'Add your name and email so I can reply.'; return; }
  busy(btn, true, 'Sending…');
  const r = await post('/api/lead', { jobType: currentService.id, name: data.name, email: data.email, answers, company_website: data.company_website });
  if (r.ok) {
    note.className = 'form-note ok';
    note.textContent = 'Got it. My agent is drafting your scope now, and I\'ll reply personally.';
    btn.textContent = 'Sent ✓';
    setTimeout(() => sheet.open && sheet.close(), 2600);
  } else {
    busy(btn, false, 'Send brief');
    note.className = 'form-note err';
    note.textContent = r.error || 'That did not go through.';
    if (r.fallbackEmail) {
      const body = Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\n— ${data.name} (${data.email})`;
      setTimeout(() => mailtoFallback(r.fallbackEmail, `Project brief: ${currentService.title}`, body), 1200);
    }
  }
});

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
  busy(btn, true, 'Auditing…');
  auditOut.innerHTML = thinking('Fetching the page and running checks…');
  const steps = ['Timing the server…', 'Reading SEO tags…', 'Checking security headers…', 'Asking the agent for fixes…'];
  let i = 0; const iv = setInterval(() => { const s = $('.thinking span:last-child', auditOut); if (s && i < steps.length) s.textContent = steps[i++]; }, 1400);
  const r = await post('/api/audit', data);
  clearInterval(iv);
  busy(btn, false, 'Run audit');
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
    ${rep.advice ? `<div class="advice"><h4>Agent recommendations</h4>${esc(rep.advice)}</div>` : ''}
    <div class="followup">
      <p class="muted" style="margin:0">Want the full write-up and a plan to fix it? I'll send it to you.</p>
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
  busy(btn, false, 'Write my fit letter');
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
  const svc = services.find((s) => s.id === id);
  if (!svc) { label.hidden = true; return; }
  label.textContent = svc.title;
  label.style.left = `${x}px`; label.style.top = `${y}px`; label.style.borderColor = svc.color;
  label.hidden = false;
}
try {
  const { createScene } = await import('./scene.js');
  scene = createScene($('#scene'), {
    services,
    onSelect: (id) => { label.hidden = true; openBrief(id); },
    onHover: (id, x, y) => (id ? showLabel(id, x, y) : (label.hidden = true)),
  });
} catch (err) {
  console.warn('3D scene unavailable:', err);
  $('#hero-hint').hidden = true;
  document.body.style.background = 'radial-gradient(80% 60% at 70% 30%, #2a0f2a, #05060f 70%)';
}
