/* test/switch.test.js — the SWITCH machine (starnet-berries): a FILTER whose cases are values of a field in the JSON a job
   carries (a webhook's body, the JSON block the step before it returned). Pure: pipeline.js + worldmodel.js, plain require(). */
'use strict';
const A = require('./_assert.js');
const P = require('../frontend/app/pipeline.js');
const WM = require('../frontend/app/worldmodel.js');

const geo = (props, belts) => ({ props, belts });
const belt = (x, y, dir) => ({ x, y, dir });
const fence = obj => 'Here is the lead.\n\n```json\n' + JSON.stringify(obj, null, 2) + '\n```\n';

/* ---- the field reader ---- */
A.eq(P.switchValue('{"tag":"Hire"}', 'tag'), 'hire', 'a whole-JSON reply: the field, trimmed and lowercased');
A.eq(P.switchValue(fence({ type: 'collab' }), 'type'), 'collab', 'a fenced ```json block (a webhook item, an agent reply) is read');
A.eq(P.switchValue('first ```json\n{"tag":"a"}\n``` then ```json\n{"tag":"b"}\n```', 'tag'), 'b', 'the LAST JSON block wins (an agent ends its reply with it)');
A.eq(P.switchValue('Decided: {"tag": "spam"} — done.', 'tag'), 'spam', 'a bare object inside prose is read');
A.eq(P.switchValue(fence({ lead: { kind: 'Hire' } }), 'lead.kind'), 'hire', 'a dotted path reads a nested field');
A.eq(P.switchValue(fence({ items: [{ sku: 'A1' }] }), 'items[0].sku'), 'a1', 'an [n] index reads into an array');
A.eq(P.switchValue(fence({ n: 3, ok: true }), 'n'), '3', 'a number reads as its text');
A.eq(P.switchValue(fence({ ok: true }), 'ok'), 'true', 'a boolean reads as its text');
A.eq(P.switchValue(fence({ lead: { kind: 'x' } }), 'lead'), null, 'an object value matches no case');
A.eq(P.switchValue(fence({ tag: 'x' }), 'missing'), null, 'an absent field is null');
A.eq(P.switchValue('no json here at all', 'tag'), null, 'no JSON is null');
A.eq(P.switchValue(fence({ tag: 'x' }), '__proto__'), null, 'prototype keys are never read');
A.eq(P.switchValue(fence({ tag: 'x' }), 'constructor.name'), null, '…nor inherited ones');
A.eq(P.switchValue(fence({ tag: 'x' }), 'tag; rm -rf'), null, 'a field outside the grammar reads nothing');
A.eq(P.switchValue(fence({ tag: 'x' })), 'x', 'the field defaults to tag');

/* ---- dispatch: INBOX -> SWITCH (cases E / S) -> bays; DEFAULT E ---- */
const floor = sw => P.compileRoutingPlan(geo(
  [{ id: 'i1', t: 'intake', x: 0, y: 0, w: 1, h: 1 },
   Object.assign({ id: 's1', t: 'switch', x: 2, y: 0, w: 1, h: 1 }, sw),
   { id: 'bh', t: 'bay', x: 5, y: 0, w: 2, h: 2, agentId: 'general' },
   { id: 'bs', t: 'bay', x: 1, y: 3, w: 2, h: 2, agentId: 'sales' }],
  [belt(1, 0, 'E'), belt(2, 0, 'E'), belt(3, 0, 'E'), belt(4, 0, 'E'), belt(2, 1, 'S'), belt(2, 2, 'S')]
));
{
  const plan = floor({ field: 'type', routes: { Hire: 'S' }, def: 'E' });
  A.eq(plan.errors.length, 0, 'a complete switch floor compiles clean');
  A.eq(plan.reach.sales, true, 'the case lane reaches its bay');
  const j = Object.values(plan.junctions).find(x => x.kind === 'filter');
  A.eq(j && j.field, 'type', 'a SWITCH compiles to a filter junction carrying its field');
  A.eq(P.resolveTarget(plan, { tag: 'general', text: fence({ type: 'hire', name: 'Ada' }) }), 'sales', 'type = hire takes its case belt (cases match ignoring case)');
  A.eq(P.resolveTarget(plan, { tag: 'general', text: fence({ type: 'question' }) }), 'general', 'a value with no case takes the DEFAULT belt');
  A.eq(P.resolveTarget(plan, { tag: 'general', text: 'plain words, no JSON' }), 'general', 'no JSON takes the DEFAULT belt');
  A.eq(P.resolveTarget(plan, { tag: 'code', text: fence({ type: 'hire', message: 'I need an API bug fixed' }) }), 'sales', 'the classifier tag never steers a switch');
  A.eq(P.resolveTarget(plan, { tag: 'general' }), 'general', 'a ctx with no text (an older caller) takes the DEFAULT belt');
  const r = P.resolveDock(plan, { text: fence({ type: 'HIRE' }) });
  A.eq(r && r.agentId, 'sales', 'resolveDock (the sidecar entry dispatcher) routes the same way');
}
{
  const plan = floor({ routes: { hire: 'S' }, def: 'E' });
  const j = Object.values(plan.junctions).find(x => x.kind === 'filter');
  A.eq(j && j.field, 'tag', 'a switch with no field reads `tag`');
  A.eq(P.resolveTarget(plan, { text: '{"tag":"hire"}' }), 'sales', '…and routes by it');
}
{
  const plan = floor({ field: 'bad field!', routes: { hire: 'S' }, def: 'E' });
  const j = Object.values(plan.junctions).find(x => x.kind === 'filter');
  A.eq(j && j.field, 'tag', 'a field outside the grammar compiles as `tag` (a hand-edited save cannot inject one)');
}

/* ---- a FILTER is untouched: no field on its junction, the classifier tag still routes ---- */
{
  const plan = P.compileRoutingPlan(geo(
    [{ id: 'i1', t: 'intake', x: 0, y: 0, w: 1, h: 1 },
     { id: 'f1', t: 'filter', x: 2, y: 0, w: 1, h: 1, routes: { research: 'S' }, def: 'E', field: 'type' },
     { id: 'bc', t: 'bay', x: 5, y: 0, w: 2, h: 2, agentId: 'coder' },
     { id: 'br', t: 'bay', x: 1, y: 3, w: 2, h: 2, agentId: 'researcher' }],
    [belt(1, 0, 'E'), belt(2, 0, 'E'), belt(3, 0, 'E'), belt(4, 0, 'E'), belt(2, 1, 'S'), belt(2, 2, 'S')]
  ));
  const j = Object.values(plan.junctions).find(x => x.kind === 'filter');
  A.eq(j && j.field, undefined, 'a FILTER never compiles a field (its plan and hash are what they were)');
  A.eq(P.resolveTarget(plan, { tag: 'research', text: fence({ type: 'zzz' }) }), 'researcher', 'a FILTER still routes by the classifier tag');
}

/* ---- the link derivation names a switch's cases on its lanes, like a filter's tags ---- */
{
  const links = P.deriveLinks(geo(
    [{ id: 'i1', t: 'intake', x: 0, y: 0, w: 1, h: 1 },
     { id: 's1', t: 'switch', x: 2, y: 0, w: 1, h: 1, routes: { hire: 'S' }, def: 'E' },
     { id: 'bh', t: 'bay', x: 5, y: 0, w: 2, h: 2 },
     { id: 'bs', t: 'bay', x: 1, y: 3, w: 2, h: 2 }],
    [belt(1, 0, 'E'), belt(2, 0, 'E'), belt(3, 0, 'E'), belt(4, 0, 'E'), belt(2, 1, 'S'), belt(2, 2, 'S')]));
  const out = links.filter(l => l.from && l.from.prop === 's1');
  A.ok(out.some(l => (l.from.tags || []).indexOf('hire') >= 0), 'the case lane\'s link carries the case');
  A.ok(out.some(l => l.from.else), 'the DEFAULT lane\'s link is the else link');
}

/* ---- the world model: place, save, configure, keep the field ---- */
{
  const wm = WM.create();
  const r = wm.roomById(wm.spawnRoomId()).rects[0];
  const sw = wm.addProp({ t: 'switch', x: r.x1 + 2, y: r.y1 + 2, w: 1, h: 1, block: false, field: 'lead.kind', routes: { hire: 'E', partnership: 'S' }, def: 'N' });
  A.ok(sw && sw.id, 'a SWITCH places');
  A.eq(wm.propById(sw.id).field, 'lead.kind', 'addProp carries the field');
  A.eq(JSON.stringify(wm.propById(sw.id).routes), JSON.stringify({ hire: 'E', partnership: 'S' }), '…and its cases');
  const g = wm.projectGeometry().props.find(p => p.id === sw.id);
  A.eq(g.field, 'lead.kind', 'projectGeometry carries the field to the compiler');
  const re = WM.deserialize(wm.serialize()).propById(sw.id);
  A.eq(re.field, 'lead.kind', 'the field survives serialize/deserialize');
  A.ok(wm.configureJunction(sw.id, { routes: { hire: 'S' }, def: 'E' }).ok, 'a save that names only routes');
  A.eq(wm.propById(sw.id).field, 'lead.kind', '…keeps the field');
  A.ok(wm.configureJunction(sw.id, { field: 'type', routes: { hire: 'S' }, def: 'E' }).ok && wm.propById(sw.id).field === 'type', 'a save that names the field changes it');
  A.ok(wm.configureJunction(sw.id, null).ok && wm.propById(sw.id).field === undefined, 'configureJunction(null) clears it with the rest');
  const bad = wm.addProp({ t: 'switch', x: r.x1 + 4, y: r.y1 + 2, w: 1, h: 1, block: false, field: 'a b', routes: { x: 'E' } });
  A.eq(wm.propById(bad.id).field, undefined, 'a field outside the grammar is never stored');
  const long = 'partnership-inquiry-2026';
  A.ok(wm.configureJunction(bad.id, { routes: { [long]: 'E' } }).ok && wm.propById(bad.id).routes[long] === 'E', 'a case value longer than a filter tag (24+) is kept');
}

/* ---- the panel: a floor click on a SWITCH opens its cases (LeVente 2026-11-17: "no options in the right menu") ---- */
{
  const fs = require('fs'), path = require('path');
  const build = fs.readFileSync(path.join(__dirname, '../frontend/app/build.js'), 'utf8');
  const panel = fs.readFileSync(path.join(__dirname, '../frontend/app/workflowpanel.js'), 'utf8');
  A.ok(/WF_PART\.filter = 1; WF_PART\.switch = 1;/.test(build), 'a floor click on a SWITCH (or FILTER) opens it in the Workflow panel');
  A.ok(/if \(p\.t === 'switch'\) return paintSwitch\(body, f, p\);/.test(panel), 'the panel paints the SWITCH card');
  A.ok(/save\(\{ field: v, routes: cur\.routes, def: cur\.def \}, '✓ now reading ' \+ v, true\)/.test(panel), 'the FIELD saves on blur without repainting the box the next click lands in');
}

A.report('switch');
