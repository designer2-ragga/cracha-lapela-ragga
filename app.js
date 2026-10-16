import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ---------- Dimensões da plaquinha de lapela (75 x 25 mm) ---------- */
const W = 7.5;
const H = 2.5;
const R = 0.16;
const DEPTH = 0.05;
const BEVEL = 0.03;

const TEX_W = 3072;
const TEX_H = Math.round(TEX_W * (H + BEVEL * 2) / (W + BEVEL * 2));

/* ---------- Estado ---------- */
const state = {
  brand: 'biggs',
  name: document.getElementById('name').value,
  role: document.getElementById('role').value,
};
const customLogos = {};

/* ---------- Marcas (placeholders até chegarem os SVGs oficiais) ---------- */
const BRANDS = {
  biggs:  { label: 'Biggs',  placeholder: { text: 'B', kind: 'glyph' } },
  robs:   { label: "Rob's",  placeholder: { text: "Rob's", kind: 'word' } },
  isaias: { label: 'Isaias', placeholder: { text: 'Isaias', kind: 'word' } },
  mapoli: { label: 'Mapoli', placeholder: { text: 'M', kind: 'glyph' } },
};

const HEAVY = (px) => `800 ${px}px "Dotties Vanilla", "Instrument Sans", sans-serif`;
const SANS = (px, w = 600) => `${w} ${px}px "Instrument Sans", sans-serif`;

/* ---------- Renderer / cena ---------- */
const canvas = document.getElementById('scene');
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
camera.position.set(0, 0.2, 14);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 7;
controls.maxDistance = 30;
controls.rotateSpeed = 0.7;

/* Ambiente de estúdio: preto infinito com softboxes. É o que o metal reflete. */
function buildStudioEnv() {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x000000);
  const box = (w, h, intensity, pos, look) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(intensity), side: THREE.DoubleSide });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.set(...pos);
    p.lookAt(...look);
    env.add(p);
  };
  const o = [0, 0, 0];
  box(14, 9, 0.62, [0, 1.5, 9], o);     // preenchimento fraco atrás da câmera
  box(12, 1.4, 4.5, [0, 3.6, 8], o);    // faixa alta: brilho que corre na escovação
  box(12, 0.5, 2.2, [0, -1.2, 8.5], o); // faixa baixa, mais fina
  box(2.2, 7, 1.6, [-5.5, 0.5, 7], o);  // softbox lateral frontal
  box(1.0, 10, 5, [-8, 0, 4], o);       // recorte lateral esquerdo
  box(1.0, 10, 3, [8, 0.5, 3], o);      // recorte lateral direito
  box(10, 6, 2.2, [0, 9, 0], o);        // teto
  box(16, 6, 0.08, [0, -8, 0], o);      // chão quase apagado
  box(6, 2, 1.6, [0, 0, -9], o);        // contra-luz para as bordas
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  return tex;
}
scene.environment = buildStudioEnv();

const key = new THREE.DirectionalLight(0xffffff, 0.6);
key.position.set(-4, 6, 8);
scene.add(key);

/* ---------- Textura de escovação ---------- */
function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  return c;
}

// Valor de escovação por pixel em [0,1]: linhas horizontais finas, com riscos que aparecem e somem.
const brush = (() => {
  const v = new Float32Array(TEX_W * TEX_H);
  const rnd = mulberry32(7);
  const rowA = new Float32Array(TEX_H);
  const rowB = new Float32Array(TEX_H);
  const freq = new Float32Array(TEX_H);
  const phase = new Float32Array(TEX_H);
  for (let y = 0; y < TEX_H; y++) {
    rowA[y] = rnd();
    rowB[y] = rnd() * rnd();
    freq[y] = 0.0015 + rnd() * 0.012;
    phase[y] = rnd() * Math.PI * 2;
  }
  // suaviza um pouco entre linhas vizinhas para não ficar "código de barras"
  const smooth = new Float32Array(TEX_H);
  for (let y = 0; y < TEX_H; y++) {
    const a = rowA[Math.max(0, y - 1)], b = rowA[y], c = rowA[Math.min(TEX_H - 1, y + 1)];
    smooth[y] = a * 0.25 + b * 0.5 + c * 0.25;
  }
  for (let y = 0; y < TEX_H; y++) {
    for (let x = 0; x < TEX_W; x++) {
      const streak = rowB[y] * Math.max(0, Math.sin(x * freq[y] + phase[y]));
      const n = smooth[y] * 0.65 + streak * 0.55 + (rnd() - 0.5) * 0.06;
      v[y * TEX_W + x] = Math.min(1, Math.max(0, n));
    }
  }
  return v;
})();

function paintBase(canvas, fn) {
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(TEX_W, TEX_H);
  const d = img.data;
  for (let i = 0; i < brush.length; i++) {
    const [r, g, b] = fn(brush[i]);
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Bases estáticas (sem gravação)
const base = {
  color: paintBase(makeCanvas(), (v) => { const k = 236 + v * 19; return [k, k, k]; }),
  orm:   paintBase(makeCanvas(), (v) => [255, 62 + v * 40, 255]),       // G = rugosidade, B = metalicidade
  bump:  paintBase(makeCanvas(), (v) => { const k = 190 + v * 50; return [k, k, k]; }),
  aniso: paintBase(makeCanvas(), () => [255, 128, 255]),                 // direção X, força total
};

// Camadas da face frontal (base + gravação), redesenhadas a cada mudança
const front = {
  color: makeCanvas(),
  orm: makeCanvas(),
  bump: makeCanvas(),
  aniso: makeCanvas(),
};

function tex(canvas, srgb = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const frontTex = {
  color: tex(front.color, true),
  orm: tex(front.orm),
  bump: tex(front.bump),
  aniso: tex(front.aniso),
};
const backTex = {
  color: tex(base.color, true),
  orm: tex(base.orm),
  bump: tex(base.bump),
  aniso: tex(base.aniso),
};

/* ---------- Geometria ---------- */
function roundedRect(shape, x, y, w, h, r) {
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
}

function buildBadgeGeometry() {
  const shape = new THREE.Shape();
  roundedRect(shape, -W / 2, -H / 2, W, H, R);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 5,
    curveSegments: 32,
  });
  geo.translate(0, 0, -DEPTH / 2);

  // UV planar normalizado: a textura cobre o crachá inteiro uma vez
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  }
  uv.needsUpdate = true;

  // Separa as tampas: frente (0), verso (1), laterais + chanfro (2)
  const lid = geo.groups.find((g) => g.materialIndex === 0);
  const side = geo.groups.find((g) => g.materialIndex === 1);
  const half = lid.count / 2;
  const firstIsFront = geo.attributes.normal.getZ(lid.start) > 0;
  geo.clearGroups();
  geo.addGroup(lid.start, half, firstIsFront ? 0 : 1);
  geo.addGroup(lid.start + half, half, firstIsFront ? 1 : 0);
  geo.addGroup(side.start, side.count, 2);
  return geo;
}

const STEEL = 0xd3d6db;
const faceMaterial = (t) => new THREE.MeshPhysicalMaterial({
  color: STEEL,
  map: t.color,
  metalness: 1,
  metalnessMap: t.orm,
  roughness: 1,
  roughnessMap: t.orm,
  bumpMap: t.bump,
  bumpScale: 1.6,
  anisotropy: 0.85,
  anisotropyMap: t.aniso,
  envMapIntensity: 1.25,
});

const materials = [
  faceMaterial(frontTex),
  faceMaterial(backTex),
  // chanfro e laterais: polido, como borda lapidada de crachá metálico
  new THREE.MeshPhysicalMaterial({ color: STEEL, metalness: 1, roughness: 0.16, envMapIntensity: 1.4 }),
];

const badge = new THREE.Mesh(buildBadgeGeometry(), materials);
const floatGroup = new THREE.Group();
floatGroup.add(badge);
scene.add(floatGroup);

/* ---------- Arte impressa ---------- */
// Tudo em px de textura. A textura cobre a placa + chanfro; PX converte unidades 3D em px.
const PX = TEX_W / (W + BEVEL * 2);
const layout = (() => {
  const ox = BEVEL * PX;                 // onde começa a face plana
  const oy = BEVEL * PX;
  const fw = W * PX;
  const fh = H * PX;
  const inset = fh * 0.065;              // filete bem rente à borda, como na referência
  const frame = { x: ox + inset, y: oy + inset, w: fw - inset * 2, h: fh - inset * 2, r: R * PX * 0.75, line: fh * 0.009 };
  const logoBox = { x: ox + fw * 0.07, y: oy + fh * 0.29, w: fw * 0.3, h: fh * 0.42 };
  const textL = ox + fw * 0.43;
  const textR = ox + fw * 0.93;
  return { ox, oy, fw, fh, frame, logoBox, textCx: (textL + textR) / 2, textW: textR - textL, cy: oy + fh / 2 };
})();

function fitFont(ctx, text, font, maxW, maxPx, minPx) {
  let px = maxPx;
  ctx.font = font(px);
  while (px > minPx && ctx.measureText(text).width > maxW) {
    px -= 2;
    ctx.font = font(px);
  }
  return px;
}

function drawPlaceholderLogo(ctx, ph, box) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // letra única ocupa a altura toda; palavra é limitada pela largura
  const maxPx = ph.kind === 'glyph' ? box.h * 1.45 : box.h * 0.95;
  fitFont(ctx, ph.text, HEAVY, box.w, maxPx, 20);
  const mt = ctx.measureText(ph.text);
  const textH = mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent;
  const cx = box.x + mt.actualBoundingBoxLeft; // tinta alinhada à esquerda da caixa
  const cy = box.y + box.h / 2 + textH / 2 - mt.actualBoundingBoxDescent;
  ctx.fillText(ph.text, cx, cy);
  ctx.restore();
}

function drawImageLogo(ctx, img, box) {
  const scale = Math.min(box.w / img.width, box.h / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const tmp = document.createElement('canvas');
  tmp.width = Math.ceil(box.w);
  tmp.height = Math.ceil(box.h);
  const t = tmp.getContext('2d');
  t.drawImage(img, 0, (box.h - h) / 2, w, h); // alinhado à esquerda, como o logo da referência
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = ctx.fillStyle;
  t.fillRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(tmp, box.x, box.y);
}

function strokeRoundedRect(ctx, { x, y, w, h, r, line }) {
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
}

// Mede a altura de caixa alta para centralizar o bloco pela tinta, não pela caixa da fonte
function capHeight(ctx) {
  return ctx.measureText('H').actualBoundingBoxAscent;
}

function drawArt(ctx, fill) {
  const { frame, logoBox, textCx, textW, cy, fh } = layout;
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;

  strokeRoundedRect(ctx, frame);

  const custom = customLogos[state.brand];
  if (custom) drawImageLogo(ctx, custom, logoBox);
  else drawPlaceholderLogo(ctx, BRANDS[state.brand].placeholder, logoBox);

  const name = state.name.trim().toUpperCase();
  const role = state.role.trim().toUpperCase();
  if (!name && !role) return;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const NAME = (px) => SANS(px, 400);
  const ROLE = (px) => SANS(px, 500);

  // [texto, fonte, px, tracking]
  const lines = [];
  if (name) {
    ctx.letterSpacing = '0px';
    const px = fitFont(ctx, name, NAME, textW, fh * 0.3, fh * 0.12);
    lines.push([name, NAME, px, px * 0.03]);
  }
  if (role) {
    // sozinho, o cargo assume o papel de título (TREINAMENTO); com nome, vira legenda (GERENTE)
    const max = name ? fh * 0.135 : fh * 0.19;
    const px = fitFont(ctx, role, ROLE, textW * 0.94, max, fh * 0.07);
    lines.push([role, ROLE, px, px * 0.06]);
  }

  const caps = lines.map(([, font, px]) => { ctx.font = font(px); return capHeight(ctx); });
  const gap = fh * 0.09;
  const blockH = caps.reduce((a, b) => a + b, 0) + gap * (lines.length - 1);
  let y = cy - blockH / 2;
  lines.forEach(([text, font, px, track], i) => {
    ctx.font = font(px);
    ctx.letterSpacing = `${track}px`;
    y += caps[i];
    // letterSpacing também é somado depois da última letra: compensa para centralizar de verdade
    ctx.fillText(text, textCx + track / 2, y);
    y += gap;
  });
  ctx.letterSpacing = '0px';
}

function composeFront() {
  const layers = [
    // [canvas, base, cor da tinta, desfoque]
    [front.color, base.color, '#0a0a0b', 0],          // impressão UV preta
    [front.orm,   base.orm,   'rgb(255,120,0)', 0],   // tinta: semifosca e não metálica
    [front.bump,  base.bump,  '#ffffff', 1.5],        // tinta fica levemente acima do alumínio
    [front.aniso, base.aniso, 'rgb(255,128,0)', 0],   // sem escovação sobre a tinta
  ];
  for (const [cv, src, fill, blur] of layers) {
    const ctx = cv.getContext('2d');
    ctx.filter = 'none';
    ctx.drawImage(src, 0, 0);
    ctx.filter = blur ? `blur(${blur}px)` : 'none';
    drawArt(ctx, fill);
    ctx.filter = 'none';
  }
  for (const t of Object.values(frontTex)) t.needsUpdate = true;
}

let composeQueued = false;
function queueCompose() {
  if (composeQueued) return;
  composeQueued = true;
  requestAnimationFrame(() => { composeQueued = false; composeFront(); });
}

/* ---------- UI ---------- */
const brandButtons = [...document.querySelectorAll('#brands button')];
const logoNote = document.getElementById('logoNote');

function setBrand(brand) {
  state.brand = brand;
  for (const b of brandButtons) b.setAttribute('aria-checked', String(b.dataset.brand === brand));
  logoNote.textContent = customLogos[brand]
    ? `Logo enviado para ${BRANDS[brand].label}.`
    : 'Logo provisório. Suba o arquivo oficial para gravar no aço.';
  queueCompose();
}

brandButtons.forEach((b) => b.addEventListener('click', () => setBrand(b.dataset.brand)));
document.getElementById('brands').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  const i = brandButtons.findIndex((b) => b.dataset.brand === state.brand);
  const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
  const next = brandButtons[(i + dir + brandButtons.length) % brandButtons.length];
  setBrand(next.dataset.brand);
  next.focus();
});

document.getElementById('name').addEventListener('input', (e) => { state.name = e.target.value; queueCompose(); });
document.getElementById('role').addEventListener('input', (e) => { state.role = e.target.value; queueCompose(); });

document.getElementById('logo').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    // SVG sem width/height chega com 0: força uma resolução de trabalho
    if (!img.width || !img.height) { img.width = 1024; img.height = 1024; }
    customLogos[state.brand] = img;
    setBrand(state.brand);
  };
  img.src = url;
  e.target.value = '';
});

/* ---------- Loop ---------- */
const hint = document.querySelector('.hint');
controls.addEventListener('start', () => hint.classList.add('is-hidden'), { once: true });

function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // em telas estreitas, afasta a câmera para o crachá caber
  const fitDist = (W * 1.35) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  if (camera.aspect < 1.2) camera.position.setLength(Math.max(14, fitDist));
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

const clock = new THREE.Clock();
function tick() {
  const t = clock.getElapsedTime();
  // flutuação lenta, como sem gravidade
  floatGroup.position.y = Math.sin(t * 0.7) * 0.12;
  floatGroup.rotation.y = Math.sin(t * 0.32) * 0.32;
  floatGroup.rotation.x = Math.sin(t * 0.45 + 1.2) * 0.07;
  floatGroup.rotation.z = Math.sin(t * 0.27 + 0.4) * 0.025;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

await Promise.all([
  document.fonts.load(HEAVY(100), 'Ag'),
  document.fonts.load(SANS(100), 'Ag'),
]);
composeFront();
resize();
tick();
