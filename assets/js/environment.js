/* ================================================================
   PROCEDURAL ROOM ENVIRONMENT

   Small, cheap vector/emoji landmarks that complement the procedural trees.
   Puddles are painted as a floor layer (actors always appear above them).
   Rocks, skulls, logs and grass are depth-sorted with trees by their baseline.
================================================================ */

const TAU = Math.PI * 2;
const OPEN_BIOMES = new Set(['ocean', 'cosmos']);

const BIOME_RULES = {
  palace:      { puddles: 0.34, rock: 0.10, log: 0.12, grass: 0.32 },
  jungle:      { puddles: 0.82, rock: 0.34, log: 0.42, grass: 0.78 },
  beach:       { puddles: 0.74, rock: 0.90, log: 0.30, grass: 0.18 },
  city:        { puddles: 0.38, rock: 0.08, log: 0.06, grass: 0.16 },
  ice:         { puddles: 0.20, rock: 0.58, log: 0.24, grass: 0.02 },
  volcano:     { puddles: 0.16, rock: 0.76, log: 0.12, grass: 0.03 },
  traditional: { puddles: 0.36, rock: 0.16, log: 0.34, grass: 0.54 },
  ruins:       { puddles: 0.28, rock: 0.58, log: 0.26, grass: 0.18 },
  spring:      { puddles: 0.46, rock: 0.12, log: 0.12, grass: 0.72 },
};

const DECOR_EMOJI = {
  rock: '🪨',
  skull: '💀',
  log: '🪵',
  grass: '🌱',
};

const DECOR_SIZES = {
  rock: 0.060,
  skull: 0.041,
  log: 0.053,
  grass: 0.046,
};

const PUDDLE_SLOTS = [
  // Keep the full blob inside the room's floor rectangle even before the
  // renderer's safety clip is applied.
  { x: 0.18, y: 0.735 },
  { x: 0.82, y: 0.725 },
  { x: 0.32, y: 0.845 },
  { x: 0.68, y: 0.835 },
];

const DECOR_SLOTS = [
  { x: 0.07, y: 0.785 },
  { x: 0.93, y: 0.775 },
  { x: 0.18, y: 0.875 },
  { x: 0.82, y: 0.865 },
  { x: 0.31, y: 0.755 },
  { x: 0.69, y: 0.745 },
];

const PLAN_CACHE = new Map();

function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seedFor(...parts) {
  return hashString(parts.join('|')) || 1;
}

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roomKey(world, cell, seed) {
  return `${seed}|${world?.id}|${cell?.col}|${cell?.row}`;
}

/** Wind is authored per world, then given a small deterministic room offset. */
export function getRoomWind(world, cell, seed = 0) {
  const authored = typeof world?.wind === 'number'
    ? world.wind
    : Number(world?.wind?.strength ?? 0.35);
  if (!world || !cell) return Math.max(0, authored);
  const roomRng = rngFrom(seedFor(seed, world.id, cell.col, cell.row, 'room-wind'));
  const roomOffset = (roomRng() - 0.5) * 0.18;
  return Math.max(0, Math.min(1.25, authored + roomOffset));
}

function roomPlan(world, cell, seed) {
  if (!world || !cell || world.isDojangTutorial || OPEN_BIOMES.has(world.biome)) return [];
  const key = roomKey(world, cell, seed);
  if (PLAN_CACHE.has(key)) return PLAN_CACHE.get(key);

  const rule = BIOME_RULES[world.biome];
  if (!rule) {
    PLAN_CACHE.set(key, []);
    return [];
  }

  const rng = rngFrom(seedFor(seed, world.id, cell.col, cell.row, 'environment'));
  const objects = [];

  // Special rooms keep their centre readable for the NPC. Side puddles and
  // small props remain possible, but the slot list never enters the centre.
  const specialRoom = ['shop', 'modifier', 'treasure', 'casino', 'teacher'].includes(cell.type);
  const puddleCount = rng() < rule.puddles
    ? (rng() < (specialRoom ? 0.18 : 0.34) ? 2 : 1)
    : 0;
  const puddleOrder = [...PUDDLE_SLOTS].sort(() => rng() - 0.5);

  for (let i = 0; i < puddleCount; i++) {
    const slot = puddleOrder[i];
    const pRng = rngFrom(seedFor(seed, world.id, cell.col, cell.row, 'puddle', i));
    const lotusChance = world.biome === 'spring' ? 0.58
      : world.biome === 'jungle' ? 0.26
      : world.biome === 'traditional' ? 0.22
      : world.biome === 'palace' ? 0.16
      : 0.04;
    objects.push({
      kind: 'puddle',
      id: `puddle-${seedFor(seed, world.id, cell.col, cell.row, i)}`,
      x: slot.x + (pRng() - 0.5) * 0.018,
      y: slot.y + (pRng() - 0.5) * 0.012,
      rx: 0.060 + pRng() * 0.032,
      ry: 0.022 + pRng() * 0.012,
      rotation: 0,
      phase: pRng() * TAU,
      // More samples prevent a single control point from becoming the sharp
      // triangular corner that used to repeat on the right side of the blob.
      lobes: Array.from({ length: 18 }, () => 0.90 + pRng() * 0.20),
      angleOffset: pRng() * TAU,
      lotus: pRng() < lotusChance,
    });
  }

  const decorTypes = [
    ['rock', rule.rock],
    ['log', rule.log],
    ['grass', rule.grass],
  ];
  // Skulls are deliberately restricted to Gyeongju, and smaller than rocks.
  if (world.id === 'gyeongju') decorTypes.push(['skull', 0.78]);

  // Shuffle once, then consume each slot at most once. The old random offset
  // could place two decorations on top of the same landmark.
  const decorOrder = [...DECOR_SLOTS].sort(() => rng() - 0.5);
  let slotIndex = 0;
  for (const [kind, chance] of decorTypes) {
    if (rng() >= chance) continue;
    const slot = decorOrder[slotIndex++ % decorOrder.length];
    const dRng = rngFrom(seedFor(seed, world.id, cell.col, cell.row, 'decor', kind, slotIndex));
    const rotation = kind === 'log'
      ? (dRng() < (2 / 3) ? (dRng() < 0.5 ? -Math.PI / 2 : Math.PI / 2) : 0)
      : 0;
    objects.push({
      kind,
      id: `${kind}-${seedFor(seed, world.id, cell.col, cell.row, kind, slotIndex)}`,
      x: slot.x + (dRng() - 0.5) * 0.012,
      y: slot.y + (dRng() - 0.5) * 0.012,
      rotation,
      phase: dRng() * TAU,
      scale: 0.86 + dRng() * 0.28,
    });
  }

  PLAN_CACHE.set(key, objects);
  return objects;
}

export function clearEnvironmentCache() {
  PLAN_CACHE.clear();
}

export function getRoomEnvironmentDepths({ world, cell, seed = 0, H = 0, details = 2 } = {}) {
  if (!world || !cell || details <= 0) return [];
  return roomPlan(world, cell, seed)
    .filter(object => object.kind !== 'puddle')
    .map(object => ({ id: object.id, baseY: object.y * H }));
}

function drawBlob(ctx, object, W, H, time, wind, details) {
  const x = object.x * W;
  const y = object.y * H;
  const rx = object.rx * W;
  const ry = object.ry * H;
  const points = object.lobes.map((lobe, i) => {
    const angle = i / object.lobes.length * TAU + (object.angleOffset || 0);
    const pulse = details >= 2
      ? 1 + Math.sin(time * 0.85 + object.phase + i * 0.7) * wind * 0.035
      : 1;
    return {
      x: x + Math.cos(angle) * rx * lobe * pulse,
      y: y + Math.sin(angle) * ry * lobe * pulse,
    };
  });

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(object.rotation);
  ctx.translate(-x, -y);
  // A soft cast shadow gives the puddle a little separation without making
  // it look like a sticker with a hard outline.
  ctx.shadowColor = 'rgba(0, 15, 35, 0.22)';
  ctx.shadowBlur = Math.max(4, H * 0.010);
  ctx.shadowOffsetY = Math.max(1, H * 0.003);
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    if (i === 0) ctx.moveTo(midX, midY);
    ctx.quadraticCurveTo(current.x, current.y, midX, midY);
  }
  ctx.closePath();
  const fill = ctx.createLinearGradient(x, y - ry, x, y + ry);
  fill.addColorStop(0, 'rgba(91, 202, 245, 0.78)');
  fill.addColorStop(0.55, 'rgba(31, 143, 214, 0.72)');
  fill.addColorStop(1, 'rgba(10, 82, 157, 0.78)');
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // All water movement is clipped inside the blob. This keeps the edge
  // quiet and lets the gradient/highlights do the visual work.
  ctx.save();
  ctx.clip();
  const sheenT = time * 0.24 + object.phase;
  const sheen = ctx.createLinearGradient(
    x - rx + Math.sin(sheenT) * rx * 0.45, y - ry,
    x + rx + Math.sin(sheenT) * rx * 0.45, y + ry,
  );
  sheen.addColorStop(0, 'rgba(220, 250, 255, 0)');
  sheen.addColorStop(0.48, 'rgba(220, 250, 255, 0.11)');
  sheen.addColorStop(0.68, 'rgba(220, 250, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);

  if (details >= 2) {
    const waveT = time * 1.15 + object.phase;
    ctx.lineWidth = Math.max(1, H * 0.00135);
    for (let i = 0; i < 2; i++) {
      const waveScale = 0.30 + i * 0.23;
      const waveAlpha = 0.08 + (Math.sin(waveT + i * 1.8) + 1) * 0.045;
      ctx.globalAlpha = waveAlpha;
      ctx.strokeStyle = '#d8f7ff';
      ctx.beginPath();
      ctx.ellipse(
        x + Math.sin(waveT * 0.7 + i) * wind * W * 0.005,
        y + (i - 0.5) * ry * 0.32,
        rx * waveScale,
        ry * (0.22 + i * 0.05),
        0, Math.PI * 0.10, Math.PI * 0.90,
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (object.lotus) {
    ctx.font = `${Math.max(16, Math.round(Math.min(W, H) * 0.045))}px 'Noto Color Emoji', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.globalAlpha = 0.90;
    ctx.fillText('🪷', x + rx * 0.10, y - ry * 0.18);
  }
  ctx.restore();
}

function drawDecor(ctx, object, W, H, time, wind, details) {
  const size = Math.max(14, Math.round(Math.min(W, H) * DECOR_SIZES[object.kind] * object.scale));
  const x = object.x * W;
  const baseY = object.y * H;

  ctx.save();
  ctx.translate(x, baseY);
  // Props stay planted. Wind animation belongs to trees and water; applying
  // a tiny rotation to every emoji made the room feel slanted and unstable.
  ctx.rotate(object.rotation);
  ctx.font = `${size}px 'Noto Color Emoji', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0,0,0,0.36)';
  ctx.shadowBlur = Math.max(2, size * 0.08);
  ctx.shadowOffsetY = Math.max(1, size * 0.06);
  ctx.fillText(DECOR_EMOJI[object.kind], 0, 0);
  ctx.restore();
}

export function drawRoomPuddles(ctx, {
  world, cell, W, H, seed = 0, time = 0, details = 2,
} = {}) {
  if (!ctx || !world || !cell || details <= 0) return;
  const wind = getRoomWind(world, cell, seed);
  for (const object of roomPlan(world, cell, seed)) {
    if (object.kind === 'puddle') drawBlob(ctx, object, W, H, time, wind, details);
  }
}

export function drawRoomEnvironmentObject(ctx, {
  world, cell, W, H, seed = 0, time = 0, details = 2, onlyId = null,
} = {}) {
  if (!ctx || !world || !cell || details <= 0) return;
  const wind = getRoomWind(world, cell, seed);
  for (const object of roomPlan(world, cell, seed)) {
    if (object.kind === 'puddle') continue;
    if (onlyId !== null && String(object.id) !== String(onlyId)) continue;
    drawDecor(ctx, object, W, H, time, wind, details);
  }
}
