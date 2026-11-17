import { profile, projects, alsoBuilt } from './content.js';
import { visuals } from './visuals.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- content ----------
const shot = (p) => (p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)} screenshot" loading="lazy">` : visuals[p.id] || '');
{
  const h = esc(profile.headline);
  const acc = profile.headlineAccent && esc(profile.headlineAccent);
  $('#hero-headline').innerHTML = acc && h.includes(acc) ? h.replace(acc, `<em>${acc}</em>`) : h;
}
$('#hero-intro').textContent = profile.intro || '';
$('#hero-now').textContent = profile.now || '';
$('#hero-now').parentElement.hidden = !profile.now;
$('#hero-where').textContent = profile.location || '';
const initials = profile.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
$('#portrait').innerHTML = profile.photo
  ? `<img src="${esc(profile.photo)}" alt="${esc(profile.name)}">`
  : `<span class="mono" aria-hidden="true">${esc(initials)}</span>`;
$('#about-start').innerHTML = profile.start.map((p) => `<p>${esc(p)}</p>`).join('');
$('#loves').innerHTML = profile.loves.map((l) => `<li><b>${esc(l.title)}</b><span>${esc(l.text)}</span></li>`).join('');
$('#skills').textContent = profile.skills.join(' · ');
$('#year').textContent = new Date().getFullYear();
$('#footer-links').innerHTML = [
  profile.github && `<a href="${esc(profile.github)}" target="_blank" rel="noopener">GitHub</a>`,
  profile.linkedin && `<a href="${esc(profile.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>`,
].filter(Boolean).join('');

$('#work-list').innerHTML = projects.map((p) => `
  <article class="proj reveal" style="--c:${p.color}">
    <div class="proj-copy">
      <p class="proj-meta">${esc(p.year || p.tag)}</p>
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.summary)}</p>
      <p class="ai-line"><b>How AI helped:</b> ${esc(p.aiShort)}</p>
      <div class="proj-actions">
        <button class="link-btn" type="button" data-project="${p.id}">The full story <span aria-hidden="true">→</span></button>
        ${p.url ? `<a class="link-btn muted" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.linkLabel || 'Visit')} ↗</a>` : ''}
      </div>
    </div>
    <button class="proj-shot" type="button" data-project="${p.id}" aria-label="More about ${esc(p.name)}">${shot(p)}</button>
  </article>`).join('');
$('#also-list').innerHTML = alsoBuilt.map((x) => `<li>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)} ↗</a>` : `<b>${esc(x.name)}</b>`}<span>${esc(x.text)}</span></li>`).join('');

// ---------- api ----------
async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ ok: false, error: 'The server sent something unexpected.' }));
  return { status: res.status, ...data };
}
const formData = (form) => Object.fromEntries(new FormData(form).entries());
const busy = (btn, on, label) => { btn.disabled = on; if (label) btn.textContent = label; };

let status = { leads: false, audit: {}, cover: {}, contactEmail: '' };
fetch('/api/status').then((r) => r.json()).then((s) => {
  status = s;
  const live = Boolean(s.leads);
  $('#agent-status').textContent = live ? 'My agents are online.' : 'My agents are offline right now, so this runs the instant checks only.';
  $('#agent-pulse').classList.toggle('is-off', !live);
}).catch(() => {
  $('#agent-status').textContent = 'My agents are offline right now.';
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
  $('#sheet-shot').innerHTML = shot(p);
  $('#sheet-ai').textContent = p.ai;
  $('#sheet-stack').innerHTML = p.stack.map((x) => `<span>${esc(x)}</span>`).join('');
  const link = $('#sheet-link');
  link.hidden = !p.url;
  if (p.url) { link.href = p.url; link.textContent = `Visit ${p.linkLabel || p.name} ↗`; }
  sheet.showModal();
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
  const steps = ['Timing the server…', 'Reading SEO tags…', 'Checking security headers…', 'Scoring the results…'];
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
    <div class="followup">
      <p class="muted" style="margin:0">Want the full write-up? My AI agent ranks the fixes, I review it, and I email it to you.</p>
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
    if (r.ok && r.report.followUp === 'queued') { note.className = 'form-note ok'; note.textContent = 'Got it. My agent is writing it now, and you\'ll get it by email once I\'ve checked it.'; }
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
  if (!/^\S+@\S+\.\S+$/.test(data.email || '')) { coverOut.innerHTML = errBox('Add your email so I can send you the letter.'); return; }
  const btn = $('button[type=submit]', coverForm);
  busy(btn, true, 'Sending…');
  coverOut.innerHTML = thinking('Handing the post to my writing agent…');
  const r = await post('/api/cover-letter', data);
  busy(btn, false, 'Send it to my agent');
  if (!r.ok) { coverOut.innerHTML = errBox(r.error || 'That did not work.'); return; }
  coverOut.innerHTML = `<div class="advice"><h4>Sent to my agent</h4>It's writing the fit letter now. I'll read it, then email it to ${esc(data.email)}. Thanks for thinking of me.</div>`;
});

// ---------- nav + reveal ----------
const nav = $('#nav');
const onScroll = () => nav.classList.toggle('is-solid', scrollY > 20);
addEventListener('scroll', onScroll, { passive: true });
onScroll();
const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
