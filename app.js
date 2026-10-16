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
  // cor do logo guardada por marca: trocar o Isaias para preto não mexe na Biggs
  logoInk: { biggs: 'brand', robs: 'brand', isaias: 'brand', mapoli: 'brand', pepito: 'brand' }, // 'brand' | 'black' | 'white'
  // acabamento por marca: 'brushed' (só escovado) ou o id de um esmalte da marca
  finish: { biggs: 'red', robs: 'yellow', isaias: 'black', mapoli: 'brown', pepito: 'red' },
  fabric: 'black',
  name: document.getElementById('name').value,
  role: document.getElementById('role').value,
};
/* ---------- Marcas: logos do manual-ragga, cargos da planilha "Cargos por lojas" ---------- */
// h = altura máxima do logo em fração da placa (símbolos sobem mais que logotipos)
// organograma: as vagas de crachá padronizadas (Biggs e Isaias)
const STANDARD_ROLES = ['Caixa', 'Caixa / Delivery', 'Garçom', 'Gerente de Salão', 'Gerente de Loja', 'Gerente ADM'];

const BRANDS = {
  biggs: {
    label: 'Biggs', ink: 'Vermelho Biggs', logo: 'logos/biggs-b.svg', tile: 'logos/ui/biggs.svg', h: 0.58,
    roles: STANDARD_ROLES,
    enamels: [{ id: 'red', label: 'Esmalte vermelho', color: '#D82C32' }],
  },
  robs: {
    label: "Rob's", ink: "Vermelho Rob's", logo: 'logos/robs.svg', tile: 'logos/ui/robs.svg', h: 0.44,
    roles: ['Líder de Loja', 'Atendente de Loja', 'Oficial de Entrega'],
    // amarelo = selo circular oficial; alaranjado é proposta (não há laranja no manual)
    // fundo claro: letras e logo em esmalte escuro, porque metal sobre amarelo some
    enamels: [
      { id: 'yellow', label: 'Esmalte amarelo', color: '#EAC900', art: '#1a1410' },
      { id: 'orange', label: 'Esmalte alaranjado', color: '#F0841E', art: '#1a1410' },
    ],
  },
  isaias: {
    label: 'Isaias', ink: 'Amarelo Isaias', logo: 'logos/isaias.svg', tile: 'logos/ui/isaias.svg', h: 0.44,
    roles: STANDARD_ROLES,
    enamels: [{ id: 'black', label: 'Esmalte preto', color: '#1a1410' }],
  },
  mapoli: {
    label: 'Mapoli', ink: 'Vermelho Mapoli', logo: 'logos/mapoli-m.svg', tile: 'logos/ui/mapoli.svg', h: 0.6,
    roles: ['Garçom'],
    enamels: [{ id: 'brown', label: 'Esmalte marrom', color: '#442924' }], // Marrom profundo, manual Mapoli (476 C)
  },
  pepito: {
    // sem aba na planilha de cargos: só o campo livre por enquanto
    label: 'Pepito', ink: 'Vermelho Pepito', logo: 'logos/pepito.svg', tile: 'logos/ui/pepito.svg', h: 0.44,
    roles: [],
    enamels: [{ id: 'red', label: 'Esmalte vermelho', color: '#e73a28' }],
  },
};
const logos = {}; // canvas já recortado na tinta, por marca
const LOGO_INK = { black: '#0a0a0b', white: '#f4f4f2' };

const HEAVY = (px) => `800 ${px}px "Dotties Vanilla", "Instrument Sans", sans-serif`;
const SANS = (px, w = 600) => `${w} ${px}px "Instrument Sans", sans-serif`;
const MONT = (px, w = 400) => `${w} ${px}px "Montserrat", sans-serif`; // tipografia do crachá

/* ---------- Renderer / cena ---------- */
const canvas = document.getElementById('scene');
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping; // mantém o vermelho e o amarelo das marcas fiéis
renderer.toneMappingExposure = 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
camera.position.set(0, 0.2, 14);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 7;
controls.rotateSpeed = 0.7;
// limita o giro para não mostrar a borda do tecido
controls.minAzimuthAngle = -0.75;
controls.maxAzimuthAngle = 0.75;
controls.minPolarAngle = Math.PI / 2 - 0.6;
controls.maxPolarAngle = Math.PI / 2 + 0.6;
controls.maxDistance = 22;

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
  // preenchimento atrás da câmera em faixas: a face pega um degradê que muda conforme inclina
  [[-3.5, 0.18], [-1.8, 0.4], [0, 0.85], [1.8, 1.25], [3.6, 0.5], [5.4, 0.22]]
    .forEach(([y, k]) => box(16, 1.8, k, [0, y, 9], o));
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
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.radius = 6;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
Object.assign(key.shadow.camera, { left: -7, right: 7, top: 5, bottom: -5, near: 1, far: 30 });
scene.add(key);
// luz macia só para o tecido ganhar volume (o metal quase não reage a ela)
const fill = new THREE.HemisphereLight(0xffffff, 0x202024, 0.0);
scene.add(fill);

/* ---------- Textura de escovação ---------- */
function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  return c;
}

// Escovação por pixel em [0,1]: ruído com desfoque de movimento horizontal em duas escalas
// (riscos longos + grão fino), mais faixas verticais largas o bastante para sobreviver ao mipmap
// e alguns riscos fundos raros. Valores ~N(0.5, 0.12).
const brush = (() => {
  const rnd = mulberry32(7);
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 0.866; // ~N(0,1)
  const v = new Float32Array(TEX_W * TEX_H);

  // ruído 1D horizontal borrado com caixa de raio r, padronizado
  const row = new Float32Array(TEX_W);
  const tmp = new Float32Array(TEX_W);
  function streakRow(r, out) {
    for (let x = 0; x < TEX_W; x++) row[x] = rnd() - 0.5;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += row[(x + TEX_W) % TEX_W];
    const k = Math.sqrt(2 * r + 1) / 0.2887 / (2 * r + 1);
    for (let x = 0; x < TEX_W; x++) {
      tmp[x] = acc * k;
      acc += row[(x + r + 1) % TEX_W] - row[(x - r + TEX_W) % TEX_W];
    }
    out.set(tmp);
  }

  // riscos longos calculados a cada STEP linhas e interpolados: engrossa o risco sem borrar o grão
  const STEP = 3;
  const keys = Math.ceil(TEX_H / STEP) + 1;
  const longRows = Array.from({ length: keys }, () => { const r = new Float32Array(TEX_W); streakRow(90, r); return r; });

  // faixas largas na vertical (bandas de brilho que se vê a olho nu)
  const band = new Float32Array(TEX_H);
  { const raw = Array.from({ length: TEX_H }, gauss); const R = 7;
    for (let y = 0; y < TEX_H; y++) { let s = 0; for (let k = -R; k <= R; k++) s += raw[Math.min(TEX_H - 1, Math.max(0, y + k))]; band[y] = s / Math.sqrt(2 * R + 1); } }
  const fineRow = new Float32Array(TEX_H).map(gauss);

  const fine = new Float32Array(TEX_W);
  for (let y = 0; y < TEX_H; y++) {
    streakRow(6, fine);
    const ky = y / STEP, k0 = Math.floor(ky), t = ky - k0;
    const L0 = longRows[k0], L1 = longRows[Math.min(keys - 1, k0 + 1)];
    const scratch = rnd() < 0.012 ? -(0.8 + rnd() * 1.6) : 0; // risco fundo ocasional
    for (let x = 0; x < TEX_W; x++) {
      const long = L0[x] * (1 - t) + L1[x] * t;
      const z = long * 0.5 + fine[x] * 0.32 + band[y] * 0.42 + fineRow[y] * 0.3 + scratch * (0.6 + 0.4 * Math.max(0, long));
      v[y * TEX_W + x] = Math.min(1, Math.max(0, 0.5 + z * 0.12));
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
  // tom do alumínio embutido aqui (não na cor do material) para não acinzentar os logos coloridos
  color: paintBase(makeCanvas(), (v) => { const k = 0.8 + v * 0.2; return [214 * k, 217 * k, 222 * k]; }),
  orm:   paintBase(makeCanvas(), (v) => [255, 50 + (1 - v) * 55, 255]), // G = rugosidade (vale = mais fosco), B = metalicidade
  bump:  paintBase(makeCanvas(), (v) => { const k = 70 + v * 150; return [k, k, k]; }),
  aniso: paintBase(makeCanvas(), () => [255, 128, 255]),                 // direção X, força total
};

// Camadas da face frontal (base + gravação), redesenhadas a cada mudança
const front = {
  color: makeCanvas(),
  orm: makeCanvas(),
  bump: makeCanvas(),
  aniso: makeCanvas(),
  coat: makeCanvas(), // R = verniz vítreo do esmalte
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
  coat: tex(front.coat),
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
  color: 0xffffff,
  map: t.color,
  metalness: 1,
  metalnessMap: t.orm,
  roughness: 1,
  roughnessMap: t.orm,
  bumpMap: t.bump,
  bumpScale: 0.9,
  anisotropy: 1,
  anisotropyMap: t.aniso,
  clearcoat: 1,
  clearcoatMap: t.coat,
  clearcoatRoughness: 0.05,
  envMapIntensity: 1.25,
});

const materials = [
  faceMaterial(frontTex),
  // verso: metal liso acetinado, sem escovação e sem impressão
  new THREE.MeshPhysicalMaterial({ color: STEEL, metalness: 1, roughness: 0.3, envMapIntensity: 1.2 }),
  // chanfro e laterais: polido, como borda lapidada de crachá metálico
  new THREE.MeshPhysicalMaterial({ color: STEEL, metalness: 1, roughness: 0.16, envMapIntensity: 1.4 }),
];

const badge = new THREE.Mesh(buildBadgeGeometry(), materials);
badge.castShadow = true;
const floatGroup = new THREE.Group();
floatGroup.add(badge, buildMagnet());
const rig = new THREE.Group(); // crachá + tecido se movem juntos
rig.add(floatGroup);
scene.add(rig);

/* Prendedor magnético colado no verso (1 unidade = 10 mm):
   tira lisa de 46 x 13 mm com dois discos de ímã de 10 mm saltados. */
function buildMagnet() {
  const g = new THREE.Group();
  const backZ = -(DEPTH / 2 + BEVEL);

  const SW = 4.6, SH = 1.3, SD = 0.06, SB = 0.02;
  const shape = new THREE.Shape();
  roundedRect(shape, -SW / 2, -SH / 2, SW, SH, 0.16);
  const stripGeo = new THREE.ExtrudeGeometry(shape, {
    depth: SD, bevelEnabled: true, bevelThickness: SB, bevelSize: SB, bevelSegments: 3, curveSegments: 16,
  });
  stripGeo.translate(0, 0, backZ - SD - SB); // face da frente da tira encosta no verso
  const nickel = new THREE.MeshPhysicalMaterial({ color: 0xc9ccd2, metalness: 1, roughness: 0.24, envMapIntensity: 1.3 });
  g.add(new THREE.Mesh(stripGeo, nickel));

  // disco com topo plano e borda arredondada (perfil girado em torno do eixo)
  const R = 0.5, Hd = 0.25, f = 0.07;
  const prof = [new THREE.Vector2(0, 0), new THREE.Vector2(R, 0), new THREE.Vector2(R, Hd - f)];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    prof.push(new THREE.Vector2(R - f + Math.cos(a) * f, Hd - f + Math.sin(a) * f));
  }
  prof.push(new THREE.Vector2(0, Hd));
  const discGeo = new THREE.LatheGeometry(prof, 64);
  discGeo.rotateX(-Math.PI / 2); // altura do perfil passa a apontar para trás (-z)
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xdfe2e6, metalness: 1, roughness: 0.1, envMapIntensity: 1.5 });
  const stripBack = backZ - SD - SB * 2;
  for (const x of [-1.55, 1.55]) {
    const d = new THREE.Mesh(discGeo, chrome);
    d.position.set(x, 0, stripBack);
    g.add(d);
  }
  return g;
}


/* ---------- Tecido (peito de quem usa o crachá) ---------- */
const FABRICS = {
  none:  { label: 'Sem tecido' },
  // sheen = força do brilho aveludado; no preto fica baixo para não acinzentar
  black: { label: 'Cinza escuro', color: '#34343a', sheen: 0.5 },
  white: { label: 'Branco', color: '#f8f4ec', sheen: 0.45 }, // off-white com creme bem leve
};

// Sarja 2/2 (diagonal de camisa social / uniforme): altura de cada fio vira normal map,
// e a variação de tom entre fios vira o mapa de cor.
function buildWeave() {
  const S = 512, N = 48, cell = S / N;
  const rnd = mulberry32(21);
  const warpTone = Array.from({ length: N }, () => 0.93 + rnd() * 0.07);
  const weftTone = Array.from({ length: N }, () => 0.93 + rnd() * 0.07);
  const hgt = new Float32Array(S * S);
  const alb = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = Math.floor(x / cell), j = Math.floor(y / cell);
      const u = (x % cell) / cell, v = (y % cell) / cell;
      const warpOver = ((i + j) % 4) < 2;
      const across = warpOver ? u : v;   // perfil do fio de cima
      const along = warpOver ? v : u;    // afunda onde o fio passa por baixo
      const round = Math.sqrt(Math.max(0, 1 - (2 * across - 1) ** 2));
      const dip = 0.72 + 0.28 * Math.sin(Math.PI * along);
      const fiber = (rnd() - 0.5) * 0.18;
      const h = round * dip + fiber * round;
      hgt[y * S + x] = h;
      const tone = warpOver ? warpTone[i] : weftTone[j];
      alb[y * S + x] = tone * (0.84 + 0.16 * h); // o relevo fica por conta do normal map
    }
  }
  const colorC = document.createElement('canvas');
  const normalC = document.createElement('canvas');
  colorC.width = colorC.height = normalC.width = normalC.height = S;
  const ci = colorC.getContext('2d').createImageData(S, S);
  const ni = normalC.getContext('2d').createImageData(S, S);
  const at = (x, y) => hgt[((y + S) % S) * S + ((x + S) % S)];
  const k = 2.2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const o = (y * S + x) * 4;
      const a = Math.round(alb[y * S + x] * 255);
      ci.data[o] = ci.data[o + 1] = ci.data[o + 2] = a; ci.data[o + 3] = 255;
      let nx = (at(x - 1, y) - at(x + 1, y)) * k, ny = (at(x, y + 1) - at(x, y - 1)) * k, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      ni.data[o] = (nx * 0.5 + 0.5) * 255; ni.data[o + 1] = (ny * 0.5 + 0.5) * 255; ni.data[o + 2] = (nz * 0.5 + 0.5) * 255; ni.data[o + 3] = 255;
    }
  }
  colorC.getContext('2d').putImageData(ci, 0, 0);
  normalC.getContext('2d').putImageData(ni, 0, 0);
  const mk = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(26, 18);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  };
  return { map: mk(colorC, true), normalMap: mk(normalC, false) };
}

function buildFabric() {
  const FW = 40, FH = 28;
  const geo = new THREE.PlaneGeometry(FW, FH, 240, 168);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    // curvatura do tórax + rugas largas, achatadas onde o crachá prende o tecido
    const chest = -0.011 * x * x - 0.004 * (y + 1) * (y + 1);
    const dx = Math.max(0, Math.abs(x) - W / 2 - 0.2), dy = Math.max(0, Math.abs(y) - H / 2 - 0.2);
    const free = Math.min(1, Math.hypot(dx, dy) / 2.5);
    const wr = 0.09 * Math.sin(x * 0.55 + y * 0.35 + 0.6) + 0.05 * Math.sin(x * 0.21 - y * 0.9 + 2.1) + 0.03 * Math.sin(x * 1.3 + y * 0.2);
    // o tecido "abraça" a borda da placa, levemente puxado para trás
    const press = -0.03 * Math.exp(-Math.hypot(dx, dy) * 3);
    pos.setZ(i, chest + wr * free * free + press);
  }
  geo.computeVertexNormals();
  const weave = buildWeave();
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x151517,
    map: weave.map,
    normalMap: weave.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.92,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0x444444),
    envMapIntensity: 0.5,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = -(DEPTH / 2 + BEVEL) - 0.012; // atrás do verso: o ímã fica do outro lado do tecido
  mesh.receiveShadow = true;
  return mesh;
}

const fabric = buildFabric();
rig.add(fabric);

function setFabric(id) {
  state.fabric = id;
  const f = FABRICS[id];
  fabric.visible = id !== 'none';
  if (f.color) {
    const c = new THREE.Color(f.color);
    fabric.material.color.copy(c);
    // brilho aveludado puxa para a própria cor, mais claro
    fabric.material.sheenColor.copy(c).lerp(new THREE.Color(0xffffff), 0.35).multiplyScalar(f.sheen);
  }
  fill.intensity = fabric.visible ? (id === 'black' ? 1.3 : 1.5) : 0;
}

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

// Rasteriza o SVG em alta e recorta na tinta: os arquivos do manual têm respiro diferente (o do Rob's é um quadrado 1080).
async function loadLogo(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const s = 2400 / Math.max(img.naturalWidth, img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (data[(y * c.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(c, -x0, -y0);
  return out;
}

function drawLogo(ctx, img, box, colored) {
  const scale = Math.min(box.w / img.width, box.h / img.height);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const t = tmp.getContext('2d');
  t.drawImage(img, 0, 0, w, h);
  // na camada de cor o logo sai com as cores do manual; nas outras vira máscara de tinta
  if (!colored) {
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = ctx.fillStyle;
    t.fillRect(0, 0, w, h);
  }
  // alinhado à esquerda e centralizado na altura, como o logo da referência
  ctx.drawImage(tmp, box.x, box.y + (box.h - h) / 2);
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

function drawArt(ctx, fill, colored = false, frameLine = true) {
  const { frame, logoBox, textCx, textW, cy, fh } = layout;
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;

  if (frameLine) strokeRoundedRect(ctx, frame);

  const logo = logos[state.brand];
  if (logo) {
    const lh = fh * BRANDS[state.brand].h;
    const box = { x: logoBox.x, y: layout.cy - lh / 2, w: logoBox.w, h: lh };
    const ink = state.logoInk[state.brand];
    if (colored && ink !== 'brand') {
      // logo chapado em preto ou branco: só a camada de cor muda, a tinta continua tinta nas outras
      ctx.fillStyle = LOGO_INK[ink];
      drawLogo(ctx, logo, box, false);
      ctx.fillStyle = fill;
    } else {
      drawLogo(ctx, logo, box, colored);
    }
  }

  // crachá nunca sai sem nome ou sem cargo: campo vazio mostra o marcador
  const name = (state.name.trim() || 'Nome').toUpperCase();
  const role = (state.role.trim() || 'Cargo').toUpperCase();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // no escovado, nome e cargo são sempre impressos em preto, qualquer que seja a cor do logo
  ctx.fillStyle = fill;
  const NAME = (px) => MONT(px, 400);
  const ROLE = (px) => MONT(px, 500);

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

// valor salvo: '<esmalte>' (borda em metal) ou '<esmalte>:neg' (esmalte inteiro, linha fina negativa)
function currentEnamel() {
  const [id, mode] = state.finish[state.brand].split(':');
  const e = BRANDS[state.brand].enamels.find((en) => en.id === id);
  return e ? { ...e, negative: mode === 'neg' } : null;
}

// Placa esmaltada de verdade: o metal forma fio, logo e letras em relevo;
// o esmalte preenche o fundo rebaixado. No negativo, o esmalte vai até a borda
// e o filete fino original aparece vazado em escovado.
function enamelMask(negative) {
  const c = makeCanvas();
  const x = c.getContext('2d');
  const f = layout.frame;
  x.fillStyle = '#fff';
  if (negative) {
    x.fillRect(0, 0, TEX_W, TEX_H);
  } else {
    const k = f.line * 1.8; // um respiro de metal entre o fio e o esmalte
    x.beginPath();
    x.roundRect(f.x + k, f.y + k, f.w - k * 2, f.h - k * 2, Math.max(0, f.r - k));
    x.fill();
  }
  x.globalCompositeOperation = 'destination-out';
  drawArt(x, '#000', false);
  return c;
}

// só logo e letras (sem o fio), para pintar com um segundo esmalte
function artMask() {
  const c = makeCanvas();
  drawArt(c.getContext('2d'), '#fff', false, false);
  return c;
}

function tinted(mask, color) {
  const c = makeCanvas();
  const x = c.getContext('2d');
  x.drawImage(mask, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, TEX_W, TEX_H);
  return c;
}

function composeFront() {
  const enamel = currentEnamel();
  if (enamel) {
    const m = enamelMask(enamel.negative);
    const a = enamel.art ? artMask() : null; // letras em esmalte escuro
    const layers = [
      // [canvas, base, cor no esmalte, cor nas letras, desfoque]
      [front.color, base.color, enamel.color, enamel.art, 0],
      [front.orm,   base.orm,   'rgb(255,18,0)', 'rgb(255,18,0)', 0],  // esmalte: liso, brilhante e não metálico
      [front.bump,  base.bump,  '#1c1c1c', '#1c1c1c', 2],             // rebaixado: o fio fica em relevo
      [front.aniso, base.aniso, 'rgb(255,128,0)', 'rgb(255,128,0)', 0], // sem escovação no esmalte
    ];
    for (const [cv, src, color, artColor, blur] of layers) {
      const ctx = cv.getContext('2d');
      ctx.filter = 'none';
      ctx.drawImage(src, 0, 0);
      ctx.filter = blur ? `blur(${blur}px)` : 'none';
      ctx.drawImage(tinted(m, color), 0, 0);
      if (a) ctx.drawImage(tinted(a, artColor), 0, 0);
      ctx.filter = 'none';
    }
    const cc = front.coat.getContext('2d');
    cc.fillStyle = '#000';
    cc.fillRect(0, 0, TEX_W, TEX_H);
    cc.drawImage(tinted(m, '#fff'), 0, 0);
    if (a) cc.drawImage(tinted(a, '#fff'), 0, 0);
    for (const t of Object.values(frontTex)) t.needsUpdate = true;
    return;
  }
  const cc = front.coat.getContext('2d');
  cc.fillStyle = '#000';
  cc.fillRect(0, 0, TEX_W, TEX_H);
  const layers = [
    // [canvas, base, cor da tinta, desfoque, logo colorido]
    [front.color, base.color, '#0a0a0b', 0, true],          // impressão UV: texto preto, logo nas cores da marca
    [front.orm,   base.orm,   'rgb(255,120,0)', 0, false],  // tinta: semifosca e não metálica
    [front.bump,  base.bump,  '#ffffff', 1.5, false],       // tinta fica levemente acima do alumínio
    [front.aniso, base.aniso, 'rgb(255,128,0)', 0, false],  // sem escovação sobre a tinta
  ];
  for (const [cv, src, fill, blur, colored] of layers) {
    const ctx = cv.getContext('2d');
    ctx.filter = 'none';
    ctx.drawImage(src, 0, 0);
    ctx.filter = blur ? `blur(${blur}px)` : 'none';
    drawArt(ctx, fill, colored);
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
const brandTiles = document.getElementById('brands');
const inkSelect = document.getElementById('logoInk');
const inkField = document.getElementById('inkField');
const finishSelect = document.getElementById('finish');
const roleInput = document.getElementById('role');
const roleChips = document.getElementById('roleChips');

// Atalhos com os cargos que existem na marca selecionada; o campo continua livre.
function renderRoleChips() {
  roleChips.replaceChildren(...BRANDS[state.brand].roles.map((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = r;
    b.setAttribute('aria-pressed', String(r.toUpperCase() === state.role.trim().toUpperCase()));
    b.addEventListener('click', () => {
      roleInput.value = r;
      state.role = r;
      renderRoleChips();
      queueCompose();
    });
    return b;
  }));
}

// botões com o logo completo: a marca escolhida fica colorida, as outras em preto e branco
brandTiles.replaceChildren(...Object.entries(BRANDS).map(([id, b]) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('role', 'radio');
  btn.setAttribute('aria-label', b.label);
  btn.dataset.brand = id;
  const img = document.createElement('img');
  img.alt = '';
  // recorta na tinta, igual ao crachá, para todos os logos ocuparem o botão por igual
  loadLogo(b.tile).then((c) => { img.src = c.toDataURL(); });
  btn.append(img);
  btn.addEventListener('click', () => setBrand(id));
  return btn;
}));
brandTiles.addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  const ids = Object.keys(BRANDS);
  const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
  const next = ids[(ids.indexOf(state.brand) + dir + ids.length) % ids.length];
  setBrand(next);
  brandTiles.querySelector(`[data-brand="${next}"]`).focus();
});

// a primeira opção leva o nome da cor da própria marca; o valor salvo é o da marca atual
function renderInkSelect() {
  inkSelect.replaceChildren(
    new Option(BRANDS[state.brand].ink, 'brand'),
    new Option('Preto', 'black'),
    new Option('Branco', 'white'),
  );
  inkSelect.value = state.logoInk[state.brand];
}

function renderFinishSelect() {
  finishSelect.replaceChildren(
    ...BRANDS[state.brand].enamels.flatMap((e) => [
      new Option(e.label, e.id),
      new Option(`${e.label} · linha negativa`, `${e.id}:neg`),
    ]),
    new Option('Só escovado', 'brushed'),
  );
  finishSelect.value = state.finish[state.brand];
  // no esmalte o logo é metal em relevo: a cor do logo não se aplica
  inkField.hidden = !!currentEnamel();
}

function setBrand(brand) {
  state.brand = brand;
  for (const t of brandTiles.children) {
    const on = t.dataset.brand === brand;
    t.setAttribute('aria-checked', String(on));
    t.tabIndex = on ? 0 : -1;
  }
  renderFinishSelect();
  renderInkSelect();
  renderRoleChips();
  queueCompose();
}

finishSelect.addEventListener('change', () => {
  state.finish[state.brand] = finishSelect.value;
  inkField.hidden = !!currentEnamel();
  queueCompose();
});

inkSelect.addEventListener('change', () => {
  state.logoInk[state.brand] = inkSelect.value;
  queueCompose();
});

const fabricChips = document.getElementById('fabrics');
fabricChips.replaceChildren(...Object.entries(FABRICS).map(([id, f]) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.dataset.fabric = id;
  b.setAttribute('aria-checked', String(id === state.fabric));
  const dot = document.createElement('span');
  dot.className = 'dot' + (id === 'none' ? ' dot-none' : '');
  if (f.color) dot.style.background = f.color;
  b.append(dot, f.label);
  b.addEventListener('click', () => {
    setFabric(id);
    for (const c of fabricChips.children) c.setAttribute('aria-checked', String(c === b));
  });
  return b;
}));
setFabric(state.fabric);

const markEmpty = (el) => el.setAttribute('aria-invalid', String(!el.value.trim()));
document.getElementById('name').addEventListener('input', (e) => { state.name = e.target.value; markEmpty(e.target); queueCompose(); });
roleInput.addEventListener('input', (e) => { state.role = e.target.value; markEmpty(e.target); renderRoleChips(); queueCompose(); });

/* ---------- Loop ---------- */
const hint = document.querySelector('.hint');
controls.addEventListener('start', () => hint.classList.add('is-hidden'), { once: true });

function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // em telas estreitas, afasta a câmera para o crachá caber
  const fitDist = (W * 1.35) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  // o limite de afastamento cresce junto, senão o OrbitControls puxa a câmera de volta e corta o crachá
  controls.maxDistance = Math.max(22, fitDist * 1.3);
  if (camera.aspect < 1.2) camera.position.setLength(Math.max(14, fitDist));
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

const clock = new THREE.Clock();
function tick() {
  const t = clock.getElapsedTime();
  // flutuação lenta, como sem gravidade
  // com tecido, o movimento vira respiração: bem menor
  const worn = state.fabric !== 'none';
  const amp = worn ? 0.25 : 1;
  rig.position.y = Math.sin(t * 0.7) * 0.12 * amp;
  rig.position.z = worn ? Math.sin(t * 0.7) * 0.05 : 0;
  rig.rotation.y = Math.sin(t * 0.32) * 0.32 * amp;
  rig.rotation.x = Math.sin(t * 0.45 + 1.2) * 0.07 * amp;
  rig.rotation.z = Math.sin(t * 0.27 + 0.4) * 0.025 * amp;
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
  document.fonts.load(MONT(100, 400), 'AgÃÇ'),
  document.fonts.load(MONT(100, 500), 'AgÃÇ'),
  ...Object.entries(BRANDS).map(async ([k, b]) => { logos[k] = await loadLogo(b.logo); }),
]);
setBrand(state.brand);
composeFront();
resize();
tick();
