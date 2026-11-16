// The hero: a glowing agent core with each service orbiting it as a node, linked by lines that carry little
// packets of "work". Drag to orbit, tap a node to open its brief. Scrolling drifts the camera through the stars.
import * as THREE from 'three';

const isCoarse = matchMedia('(pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createScene(canvas, { services, onSelect, onHover }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isCoarse, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isCoarse ? 1.75 : 2));
  renderer.setClearColor(0x05060f, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060f, 0.035);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 0, 12);

  const glow = glowTexture();
  const world = new THREE.Group(); // everything that orbits with the drag
  scene.add(world);

  // ---------- core ----------
  const berry = new THREE.Color('#ff3d6e');
  const cyan = new THREE.Color('#4de1ff');
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: berry }, uB: { value: new THREE.Color('#5b16c9') } },
    vertexShader: `
      uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vD;
      void main(){
        vec3 p = position;
        float d = sin(p.x*3.0+uTime*1.3)*sin(p.y*3.2+uTime*1.1)*sin(p.z*2.8+uTime*0.9);
        p += normal * d * 0.12; vD = d;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uA; uniform vec3 uB; varying vec3 vN; varying vec3 vV; varying float vD;
      void main(){
        float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.2);
        vec3 col = mix(uB*0.5, uA, clamp(f*1.3 + vD*0.8 + 0.25, 0.0, 1.0));
        gl_FragColor = vec4(col + f*0.7, 1.0);
      }`,
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, isCoarse ? 24 : 48), coreMat);
  world.add(core);

  const shell = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.75, 1)),
    new THREE.LineBasicMaterial({ color: cyan, transparent: true, opacity: 0.22 }),
  );
  world.add(shell);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: berry, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(7);
  world.add(halo);

  const rings = [];
  for (const [r, tilt, color, op] of [[2.6, 1.2, cyan, 0.35], [3.4, -0.5, berry, 0.25], [4.3, 0.3, new THREE.Color('#a98bff'), 0.18]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 160),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.set(Math.PI / 2 + tilt * 0.3, tilt, 0);
    world.add(ring);
    rings.push(ring);
  }

  // ---------- service nodes + links + packets ----------
  const nodes = [];
  const pickables = [];
  services.forEach((svc, i) => {
    const color = new THREE.Color(svc.color);
    const radius = 3.1 + (i % 2) * 0.9;
    const tilt = (i - 1.5) * 0.35;
    const speed = 0.12 + i * 0.025;
    const phase = (i / services.length) * Math.PI * 2;

    const group = new THREE.Group();
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 24), new THREE.MeshBasicMaterial({ color }));
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.scale.setScalar(1.6);
    // A bigger invisible hit area so fingers can tap it.
    const hit = new THREE.Mesh(new THREE.SphereGeometry(isCoarse ? 0.75 : 0.5, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.id = svc.id;
    group.add(orb, aura, hit);
    world.add(group);
    pickables.push(hit);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
    world.add(line);

    const packets = [0, 0.5].map((o) => {
      const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
      p.scale.setScalar(0.35);
      p.userData.offset = o + Math.random() * 0.2;
      world.add(p);
      return p;
    });

    nodes.push({ svc, group, orb, aura, line, packets, radius, tilt, speed, phase, hover: 0 });
  });

  // ---------- stars ----------
  const STAR_COUNT = isCoarse ? 900 : 2200;
  const pos = new Float32Array(STAR_COUNT * 3);
  const seed = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    const r = 14 + Math.random() * 60;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th) * 0.6, r * Math.cos(ph) - 20], i * 3);
    seed[i] = Math.random();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const starMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float seed; uniform float uTime; uniform float uPx; varying float vA; varying float vS;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vA = 0.45 + 0.55*sin(uTime*(0.6+seed*1.8) + seed*40.0);
        vS = seed;
        gl_PointSize = (1.2 + seed*2.6) * uPx * (30.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA; varying float vS;
      void main(){
        float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        vec3 c = mix(vec3(0.75,0.85,1.0), vec3(1.0,0.6,0.75), step(0.85, vS));
        gl_FragColor = vec4(c, vA * smoothstep(0.5, 0.0, d));
      }`,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // ---------- interaction ----------
  const state = { rotY: 0.4, rotX: 0.15, velY: 0, velX: 0, dragging: false, moved: 0, lastX: 0, lastY: 0, mx: 0, my: 0, scroll: 0, hovered: null };
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const inHero = () => state.scroll < 0.85;
  function pick(clientX, clientY) {
    ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.id : null;
  }

  // The hero lets pointer events fall through to the canvas, so the canvas only sees touches on open space.
  canvas.addEventListener('pointerdown', (e) => {
    state.dragging = true; state.moved = 0; state.lastX = e.clientX; state.lastY = e.clientY;
  });
  addEventListener('pointermove', (e) => {
    state.mx = (e.clientX / innerWidth) * 2 - 1;
    state.my = (e.clientY / innerHeight) * 2 - 1;
    if (state.dragging) {
      const dx = e.clientX - state.lastX; const dy = e.clientY - state.lastY;
      state.moved += Math.abs(dx) + Math.abs(dy);
      state.velY = dx * 0.005; state.velX = dy * 0.003;
      state.rotY += state.velY; state.rotX = THREE.MathUtils.clamp(state.rotX + state.velX, -0.6, 0.8);
      state.lastX = e.clientX; state.lastY = e.clientY;
    } else if (!isCoarse && inHero()) {
      const id = pick(e.clientX, e.clientY);
      if (id !== state.hovered) { state.hovered = id; canvas.style.cursor = id ? 'pointer' : ''; onHover?.(id, e.clientX, e.clientY); }
      else if (id) onHover?.(id, e.clientX, e.clientY);
    }
  }, { passive: true });
  addEventListener('pointerup', (e) => {
    if (!state.dragging) return;
    state.dragging = false;
    if (state.moved < 8 && inHero() && e.target === canvas) {
      const id = pick(e.clientX, e.clientY);
      if (id) onSelect(id);
    }
  });
  addEventListener('pointercancel', () => { state.dragging = false; });

  function resize() {
    const w = innerWidth; const h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ---------- loop ----------
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  let running = true;
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { clock.getDelta(); requestAnimationFrame(tick); } });

  function tick() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime * (reduceMotion ? 0.25 : 1);
    const portrait = innerHeight > innerWidth;

    state.scroll = scrollY / innerHeight;
    if (!state.dragging) {
      state.rotY += state.velY + dt * 0.06;
      state.velY *= 0.94; state.velX *= 0.9;
      state.rotX += (0.15 - state.rotX) * 0.02;
    }
    const s = Math.min(state.scroll, 4);
    world.rotation.y = state.rotY + s * 0.6;
    world.rotation.x = state.rotX + (isCoarse ? 0 : state.my * 0.08);

    // Where the core sits: right of the copy on desktop, above it on phones; it drifts away as you scroll.
    const baseX = portrait ? 0 : 2.6;
    const baseY = portrait ? 1.7 : 0.2;
    const fade = THREE.MathUtils.clamp(s, 0, 1);
    world.position.set(baseX + (portrait ? 0 : fade * 1.2), baseY + fade * (portrait ? 1.2 : 0.6), -fade * 3);
    world.scale.setScalar(portrait ? 0.78 : 1);
    camera.position.x += ((isCoarse ? 0 : state.mx * 0.5) - camera.position.x) * 0.04;
    camera.position.y += ((isCoarse ? 0 : -state.my * 0.3) - s * 1.2 - camera.position.y) * 0.06;
    camera.position.z = 12 + s * 1.5;
    camera.lookAt(0, -s * 1.2, 0);

    coreMat.uniforms.uTime.value = t;
    core.rotation.y = t * 0.15;
    shell.rotation.y = -t * 0.1; shell.rotation.x = t * 0.05;
    halo.material.opacity = 0.45 + Math.sin(t * 1.6) * 0.08;
    rings.forEach((r, i) => { r.rotation.z = t * (0.05 + i * 0.03) * (i % 2 ? -1 : 1); });

    for (const n of nodes) {
      const a = n.phase + t * n.speed;
      tmp.set(Math.cos(a) * n.radius, Math.sin(a * 1.3) * 0.6 + n.tilt * 1.4, Math.sin(a) * n.radius);
      n.group.position.copy(tmp);
      const target = state.hovered === n.svc.id ? 1 : 0;
      n.hover += (target - n.hover) * 0.15;
      n.group.scale.setScalar(1 + n.hover * 0.5 + Math.sin(t * 2 + n.phase) * 0.06);
      const lp = n.line.geometry.attributes.position;
      lp.setXYZ(1, tmp.x, tmp.y, tmp.z); lp.needsUpdate = true;
      n.line.material.opacity = 0.22 + n.hover * 0.5;
      for (const p of n.packets) {
        const k = (t * 0.35 + p.userData.offset) % 1;
        p.position.copy(tmp).multiplyScalar(k);
        p.material.opacity = Math.sin(k * Math.PI) * 0.95;
      }
    }

    starMat.uniforms.uTime.value = t;
    stars.rotation.y = t * 0.004 + s * 0.05;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    // Screen position of a node, for placing its label on touch devices.
    screenPos(id) {
      const n = nodes.find((x) => x.svc.id === id);
      if (!n) return null;
      n.group.getWorldPosition(tmp).project(camera);
      return { x: (tmp.x + 1) / 2 * innerWidth, y: (1 - tmp.y) / 2 * innerHeight };
    },
    pulse(id) { const n = nodes.find((x) => x.svc.id === id); if (n) n.hover = 1.6; },
  };
}
