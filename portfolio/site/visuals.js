// Drawn stand-ins for each project, used until a real screenshot is set as `image` in content.js.
// They are illustrations of what each product does, not real data.
const bar = '<div class="scr-bar"><i></i><i></i><i></i></div>';

export const visuals = {
  beanbaron: `<div class="scr scr-bean" aria-hidden="true">${bar}<div class="scr-body">
    <div class="chart"><div class="k">Bean market</div><div class="v">Sell now?</div>
      <svg viewBox="0 0 200 70" preserveAspectRatio="none"><polyline fill="none" stroke="#ffc14d" stroke-width="2.5" points="0,55 20,50 40,52 60,38 80,42 100,30 120,34 140,18 160,24 180,12 200,16"/></svg></div>
    <div class="side"><div><span class="k">Harvest</span><b>☕ Beans</b></div><div><span class="k">Build</span><b>Roastery</b></div><div><span class="k">Climb</span><b>Leaderboard</b></div></div>
  </div></div>`,

  cardinal: `<div class="scr scr-card" aria-hidden="true">${bar}<div class="scr-body">
    <div class="tag">AI lead assistant</div>
    <div class="msg in">Hi, do you build sites for restaurants? We need online ordering.</div>
    <div class="msg out">We do! How many locations, and how do orders come in today?</div>
    <div class="msg in">Two locations, phone orders only.</div>
    <div class="msg out">Got it. I've booked you a 15-minute call for Thursday.</div>
  </div></div>`,

  chexi: `<div class="scr scr-chexi" aria-hidden="true">${bar}<div class="scr-body">
    <div class="t">Sources<span class="bars"><i style="height:40%"></i><i style="height:70%"></i><i style="height:55%"></i><i style="height:85%"></i></span></div>
    <div class="t">Noise<span class="bars dim"><i style="height:90%"></i><i style="height:65%"></i><i style="height:80%"></i><i style="height:60%"></i></span></div>
    <div class="t hot">Signal<b>●</b></div>
    <div class="t wide">What matters, as it happens<svg viewBox="0 0 300 60" preserveAspectRatio="none"><polyline fill="none" stroke="#4de1ff" stroke-width="2" points="0,45 30,40 60,44 90,30 120,35 150,12 180,28 210,22 240,30 270,18 300,20"/></svg></div>
  </div></div>`,
};
