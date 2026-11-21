// The aquarium above the reading calendar, drawn on one canvas. One animation loop
// moves everything, and it only runs while the tank is on screen, the tab is in
// front and the reader hasn't asked for reduced motion. Otherwise the tank is drawn
// once, still, whenever something changes.

import type { Source, Tank, TankFish } from "./aquarium-data.js";

const HEIGHT = 200;
const FLOOR = 18;
/** A middle-layer fish's length, nose to tail, in CSS pixels. */
const FISH_LENGTH = 26;
const CRUISE_SPEED = 26;
const FLEE_SPEED = 150;
const FLEE_RADIUS = 60;
const FLEE_SECONDS = 0.7;
const MAX_SHELLS = 30;
/** Bubbles per second at 1 and at 100 saved words. The rate stops rising at 100. */
const BUBBLE_RATE: readonly [number, number] = [0.25, 1.6];
const BUBBLE_WORDS_CAP = 100;
/** Silver fish brighten and dim over this many seconds. */
const SHIMMER_SECONDS = 4;
/** How far the other fish fade towards the water while some fish are highlighted. */
const HIGHLIGHT_FADE = 0.7;
const HIGHLIGHT_SECONDS = 0.2;
/**
 * The two stripes, as their middles measured from the nose and a width, in shares of
 * the fish's length. Together they cover 20% of it.
 */
const STRIPES = [0.36, 0.6] as const;
const STRIPE_WIDTH = 0.1;

/**
 * A tuple type: an array with a fixed length and a type for each place. Here it's
 * red, green and blue, each 0 to 255.
 */
type Rgb = [number, number, number];

interface Palette {
  waterTop: Rgb;
  waterBottom: Rgb;
  floor: Rgb;
  /** The 8 book colours, in the order books take them. */
  books: Rgb[];
  silver: Rgb;
  plant: Rgb;
  shell: Rgb;
  /** How strong the rays of light are, 0 to 1. */
  ray: number;
}

/** Back, middle and front. Back fish are smaller, slower and a little hazier. */
const LAYERS = [
  { scale: 0.7, speed: 0.65, haze: 0.15 },
  { scale: 1, speed: 1, haze: 0 },
  { scale: 1.3, speed: 1.15, haze: 0 },
] as const;
// `as const` keeps the literal values and makes the array read-only, so TypeScript
// knows there are exactly three layers and `Layer` can only be 0, 1 or 2.
type Layer = 0 | 1 | 2;

interface Fish {
  data: TankFish;
  layer: Layer;
  /** Where it starts, as a share of the tank's width, for a tank that has no width yet. */
  homeX: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  /** -1 facing left to 1 facing right. In between, it's turning round. */
  facing: number;
  /** Nose up or down, in radians. */
  tilt: number;
  phase: number;
  fleeUntil: number;
}

/**
 * A fish shape, nose to the right, in units of the fish's length. `body` draws the
 * outline, with `wag` moving the tail. `nose` and `tailEnd` bound the length, which
 * the head's colour is clipped to, and `halfHeight` keeps fins inside the water.
 */
interface Shape {
  body: (length: number, wag: number) => Path2D;
  nose: number;
  tailEnd: number;
  halfHeight: number;
  eye: readonly [number, number];
}

/** The first fish shape, from the prototype: an oval body and a triangle tail. */
const OVAL: Shape = {
  body: (length, wag) => {
    const path = new Path2D();
    path.ellipse(0, 0, length * 0.36, length * 0.24, 0, 0, Math.PI * 2);
    path.moveTo(-length * 0.3, 0);
    path.lineTo(-length * 0.64, -length * 0.2 + wag);
    path.lineTo(-length * 0.64, length * 0.2 + wag);
    path.closePath();
    return path;
  },
  nose: 0.36,
  tailEnd: -0.64,
  halfHeight: 0.3,
  eye: [0.2, -0.05],
};

/** Oval, tall and round like an angelfish, and long and slim like a minnow. */
const SHAPES: readonly Shape[] = [
  OVAL,
  {
    body: (length, wag) => {
      const path = new Path2D();
      path.ellipse(0, 0, length * 0.3, length * 0.29, 0, 0, Math.PI * 2);
      // Swept-back fins above and below.
      path.moveTo(length * 0.06, -length * 0.26);
      path.lineTo(-length * 0.3, -length * 0.56);
      path.lineTo(-length * 0.2, -length * 0.12);
      path.closePath();
      path.moveTo(length * 0.06, length * 0.26);
      path.lineTo(-length * 0.3, length * 0.56);
      path.lineTo(-length * 0.2, length * 0.12);
      path.closePath();
      path.moveTo(-length * 0.24, 0);
      path.lineTo(-length * 0.5, -length * 0.17 + wag);
      path.lineTo(-length * 0.5, length * 0.17 + wag);
      path.closePath();
      return path;
    },
    nose: 0.3,
    tailEnd: -0.5,
    halfHeight: 0.58,
    eye: [0.14, -0.07],
  },
  {
    body: (length, wag) => {
      const path = new Path2D();
      path.ellipse(length * 0.04, 0, length * 0.42, length * 0.13, 0, 0, Math.PI * 2);
      // A forked tail.
      path.moveTo(-length * 0.32, 0);
      path.lineTo(-length * 0.62, -length * 0.16 + wag);
      path.lineTo(-length * 0.52, wag);
      path.lineTo(-length * 0.62, length * 0.16 + wag);
      path.closePath();
      return path;
    },
    nose: 0.46,
    tailEnd: -0.62,
    halfHeight: 0.2,
    eye: [0.32, -0.03],
  },
];

interface Bubble {
  x: number;
  y: number;
  radius: number;
  speed: number;
  phase: number;
}

interface Plant {
  /** Across the tank, as a share of its width. */
  x: number;
  front: boolean;
  /** Growth in days, against the plant's size from 0 to 1. */
  growth: readonly (readonly [number, number])[];
  /** The tallest it gets, as a share of the water's height. */
  height: number;
  blades: number;
  seed: number;
}

/** Nothing at 0 or 1 days, a sprout at 3, a full plant at 7, a second at 14, a full tank at 30. */
const PLANTS: readonly Plant[] = [
  { x: 0.2, front: false, growth: [[1, 0], [3, 0.3], [7, 1]], height: 0.62, blades: 5, seed: 11 },
  { x: 0.8, front: true, growth: [[7, 0], [14, 1]], height: 0.42, blades: 4, seed: 23 },
  { x: 0.46, front: false, growth: [[14, 0], [22, 1]], height: 0.5, blades: 4, seed: 37 },
  { x: 0.07, front: true, growth: [[16, 0], [26, 1]], height: 0.36, blades: 3, seed: 41 },
  { x: 0.63, front: false, growth: [[18, 0], [28, 1]], height: 0.7, blades: 6, seed: 53 },
  { x: 0.93, front: false, growth: [[20, 0], [30, 1]], height: 0.55, blades: 4, seed: 67 },
  { x: 0.34, front: true, growth: [[22, 0], [30, 1]], height: 0.3, blades: 3, seed: 79 },
];

const RAYS = [
  { x: 0.16, width: 90, phase: 0 },
  { x: 0.3, width: 46, phase: 1.3 },
];

/** Light-scheme values, for a token that can't be read. */
const FALLBACK: Palette = {
  waterTop: [0xcf, 0xe3, 0xee],
  waterBottom: [0x7f, 0xa9, 0xc4],
  floor: [0xd9, 0xcb, 0xae],
  books: [
    [0xe0, 0x7a, 0x2e],
    [0xc8, 0x34, 0x4a],
    [0xd9, 0xa8, 0x1e],
    [0x7b, 0x4f, 0xb8],
    [0x3e, 0x9a, 0x4c],
    [0xd4, 0x5a, 0x9e],
    [0x8a, 0x5a, 0x2b],
    [0x2f, 0x5f, 0xb0],
  ],
  silver: [0x8e, 0x9b, 0xa6],
  plant: [0x4e, 0x8a, 0x4a],
  shell: [0xf3, 0xe6, 0xd8],
  ray: 0.4,
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const fish = new Map<string, Fish>();

let canvas: HTMLCanvasElement | null = null;
let context: CanvasRenderingContext2D | null = null;
let width = 0;
let palette = FALLBACK;
let tank: Tank | null = null;
let bubbles: Bubble[] = [];
let bubbleDue = 0;
let pointer: { x: number; y: number } | null = null;
let onScreen = false;
let frame = 0;
let lastTime = 0;
/** Seconds of animation, which only passes while the loop runs. */
let clock = 0;
/** Which fish stand out: a book's, or one day's. Kept while the highlight fades away. */
type Highlight = { kind: "book"; bookId: string } | { kind: "day"; date: string };
let highlighted: Highlight | null = null;
/** 0 to 1: how far the highlight has come in. */
let emphasis = 0;
let emphasisTarget = 0;

export function mountAquarium(element: HTMLCanvasElement): void {
  canvas = element;
  context = element.getContext("2d");
  palette = readPalette(element);
  new ResizeObserver(resize).observe(element);
  new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting);
    updateLoop();
  }).observe(element);
  document.addEventListener("visibilitychange", updateLoop);
  reducedMotion.addEventListener("change", updateLoop);
  // A colour scheme change swaps the tokens on the root element.
  new MutationObserver(() => {
    palette = readPalette(element);
    redraw();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-scheme"] });
  element.addEventListener("pointermove", (event) => {
    // Canvas coordinates, so it's right however far the page has scrolled.
    const box = element.getBoundingClientRect();
    pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
  });
  element.addEventListener("pointerleave", () => {
    pointer = null;
  });
}

/** Fish for days still in the tank keep their place. New days get a new fish. */
export function setTank(next: Tank): void {
  tank = next;
  const dates = new Set(next.fish.map((day) => day.date));
  for (const date of fish.keys()) {
    if (!dates.has(date)) {
      fish.delete(date);
    }
  }
  for (const day of next.fish) {
    const existing = fish.get(day.date);
    if (existing === undefined) {
      fish.set(day.date, newFish(day));
    } else {
      existing.data = day;
      // A new shape can be taller, so it might now poke out of the water.
      if (width > 0) {
        keepInside(existing);
      }
    }
  }
  if (next.wordsSaved === 0) {
    bubbles = [];
  }
  redraw();
}

/**
 * Makes a book's fish stand out, or ends that with null. The library calls this
 * from its book cards, so the aquarium never has to look at the page.
 */
export function highlightBook(bookId: string | null): void {
  highlight(bookId === null ? null : { kind: "book", bookId });
}

/**
 * Makes one day's fish stand out, or ends that with null. The calendar calls this
 * from its days. A day without a fish changes nothing, rather than fading them all.
 */
export function highlightDay(date: string | null): void {
  highlight(date === null || !fish.has(date) ? null : { kind: "day", date });
}

function highlight(next: Highlight | null): void {
  if (next !== null) {
    highlighted = next;
  }
  emphasisTarget = next === null ? 0 : 1;
  // Without the loop there's nothing to ease it in, so it changes at once.
  if (frame === 0) {
    emphasis = emphasisTarget;
    settleHighlight();
    redraw();
  }
}

function easeHighlight(seconds: number): void {
  const step = seconds / HIGHLIGHT_SECONDS;
  emphasis += clamp(emphasisTarget - emphasis, -step, step);
  settleHighlight();
}

function settleHighlight(): void {
  if (emphasis === 0 && emphasisTarget === 0) {
    highlighted = null;
  }
}

function updateLoop(): void {
  const running = onScreen && !document.hidden && !reducedMotion.matches && width > 0;
  if (running && frame === 0) {
    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
  } else if (!running && frame !== 0) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  if (!running) {
    if (reducedMotion.matches) {
      bubbles = [];
    }
    emphasis = emphasisTarget;
    settleHighlight();
    redraw();
  }
}

function tick(now: number): void {
  // A long gap, such as a slow frame, moves things as if it were a short one.
  const seconds = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  clock += seconds;
  for (const one of fish.values()) {
    swim(one, seconds);
  }
  moveBubbles(seconds);
  easeHighlight(seconds);
  draw();
  frame = requestAnimationFrame(tick);
}

/** The loop draws every frame, so this only draws when it isn't running. */
function redraw(): void {
  if (frame === 0) {
    draw();
  }
}

function resize(): void {
  if (canvas === null || context === null) {
    return;
  }
  const previous = width;
  width = canvas.clientWidth;
  const density = window.devicePixelRatio;
  canvas.width = Math.round(width * density);
  canvas.height = Math.round(HEIGHT * density);
  context.setTransform(density, 0, 0, density, 0, 0);
  for (const one of fish.values()) {
    one.x = previous === 0 ? one.homeX * width : (one.x * width) / previous;
    one.targetX = previous === 0 ? one.x : (one.targetX * width) / previous;
    keepInside(one);
  }
  updateLoop();
  redraw();
}

// Fish

function newFish(day: TankFish): Fish {
  // Seeded by its date, so a fish keeps its layer and still place from one visit to the next.
  const random = seededRandom(hash(day.date));
  const layer = layerFor(random());
  const homeX = 0.08 + random() * 0.84;
  const one: Fish = {
    data: day,
    layer,
    homeX,
    x: homeX * width,
    y: 0,
    vx: 0,
    vy: 0,
    targetX: 0,
    targetY: 0,
    facing: random() < 0.5 ? -1 : 1,
    tilt: 0,
    phase: random() * Math.PI * 2,
    fleeUntil: 0,
  };
  const { top, bottom } = verticalBounds(one);
  one.y = top + random() * (bottom - top);
  one.targetX = one.x;
  one.targetY = one.y;
  return one;
}

/** A third of fish in each layer. */
function layerFor(share: number): Layer {
  if (share < 1 / 3) {
    return 0;
  }
  return share < 2 / 3 ? 1 : 2;
}

function lengthOf(one: Fish): number {
  return FISH_LENGTH * LAYERS[one.layer].scale;
}

function shapeOf(one: Fish): Shape {
  return SHAPES[one.data.shape] ?? OVAL;
}

function verticalBounds(one: Fish): { top: number; bottom: number } {
  const reach = lengthOf(one) * shapeOf(one).halfHeight;
  return { top: 10 + reach, bottom: HEIGHT - FLOOR - 6 - reach };
}

function horizontalBounds(one: Fish): { left: number; right: number } {
  const margin = lengthOf(one) * 0.7 + 6;
  return { left: margin, right: Math.max(margin, width - margin) };
}

function swim(one: Fish, seconds: number): void {
  const layer = LAYERS[one.layer];
  const cruise = CRUISE_SPEED * layer.speed;
  const wasFleeing = clock < one.fleeUntil;
  if (pointer !== null && Math.hypot(one.x - pointer.x, one.y - pointer.y) < FLEE_RADIUS * layer.scale) {
    one.fleeUntil = clock + FLEE_SECONDS;
  }

  let wantX: number;
  let wantY: number;
  let response: number;
  if (clock < one.fleeUntil && pointer !== null) {
    const awayX = one.x - pointer.x;
    const awayY = one.y - pointer.y;
    const distance = Math.hypot(awayX, awayY) || 1;
    wantX = (awayX / distance) * FLEE_SPEED * layer.speed;
    wantY = (awayY / distance) * FLEE_SPEED * layer.speed;
    response = 6;
  } else {
    if (wasFleeing) {
      chooseTarget(one);
    }
    const towardX = one.targetX - one.x;
    const towardY = one.targetY - one.y;
    const distance = Math.hypot(towardX, towardY);
    if (distance < 12) {
      chooseTarget(one);
    }
    wantX = distance === 0 ? 0 : (towardX / distance) * cruise;
    // Fish swim mostly level, so they rise and sink gently.
    wantY = distance === 0 ? 0 : clamp((towardY / distance) * cruise, -cruise * 0.45, cruise * 0.45);
    response = 0.9;
  }

  const blend = Math.min(1, seconds * response);
  one.vx += (wantX - one.vx) * blend;
  one.vy += (wantY - one.vy) * blend;
  one.x += one.vx * seconds;
  one.y += one.vy * seconds;
  if (keepInside(one) && clock >= one.fleeUntil) {
    chooseTarget(one);
  }

  // A fish only faces the way it's going. Turning round takes a moment.
  if (Math.abs(one.vx) > 1) {
    const way = Math.sign(one.vx);
    one.facing += clamp(way - one.facing, -seconds * 5, seconds * 5);
  }
  const wantTilt = clamp(Math.atan2(one.vy, Math.abs(one.vx)), -0.4, 0.4);
  one.tilt += (wantTilt - one.tilt) * Math.min(1, seconds * 4);
}

/** A long run across the tank, ending short of the glass so the fish turns in open water. */
function chooseTarget(one: Fish): void {
  const { left, right } = horizontalBounds(one);
  const { top, bottom } = verticalBounds(one);
  const run = 150 + Math.random() * 300;
  const roomLeft = one.x - left;
  const roomRight = right - one.x;
  let way = Math.random() < 0.5 ? -1 : 1;
  if (roomLeft < 120) {
    way = 1;
  } else if (roomRight < 120) {
    way = -1;
  }
  one.targetX = clamp(one.x + way * run, left, right);
  one.targetY = clamp(one.y + (Math.random() - 0.5) * 120, top, bottom);
}

/** Keeps a fish in the water, and says whether it had to. */
function keepInside(one: Fish): boolean {
  const { left, right } = horizontalBounds(one);
  const { top, bottom } = verticalBounds(one);
  const x = clamp(one.x, left, right);
  const y = clamp(one.y, top, bottom);
  const moved = x !== one.x || y !== one.y;
  if (x !== one.x) {
    one.vx = 0;
  }
  if (y !== one.y) {
    one.vy = 0;
  }
  one.x = x;
  one.y = y;
  return moved;
}

function isHighlighted(one: Fish): boolean {
  if (highlighted === null) {
    return false;
  }
  if (highlighted.kind === "day") {
    return one.data.date === highlighted.date;
  }
  const { bookId } = highlighted;
  const matches = (source: Source | null): boolean => source?.kind === "book" && source.bookId === bookId;
  return matches(one.data.head) || matches(one.data.tail) || matches(one.data.stripes);
}

/**
 * A source's full colour, worked out as it's drawn: silver shimmers, back fish take
 * a little haze, and while some fish are highlighted the others fade.
 */
function colourOf(source: Source, one: Fish, still: boolean): string {
  const water = mix(palette.waterTop, palette.waterBottom, 0.5);
  let colour = source.kind === "book" ? (palette.books[source.colour] ?? palette.silver) : palette.silver;
  if (source.kind === "articles" && !still) {
    const wave = Math.sin((clock * Math.PI * 2) / SHIMMER_SECONDS + one.phase);
    colour = wave > 0 ? mix(colour, [255, 255, 255], 0.25 * wave) : mix(colour, [0, 0, 0], -0.12 * wave);
  }
  colour = mix(colour, water, LAYERS[one.layer].haze);
  if (highlighted !== null && !isHighlighted(one)) {
    colour = mix(colour, water, HIGHLIGHT_FADE * emphasis);
  }
  return css(colour);
}

// Bubbles

function moveBubbles(seconds: number): void {
  const words = tank?.wordsSaved ?? 0;
  if (words > 0) {
    const share = (Math.min(words, BUBBLE_WORDS_CAP) - 1) / (BUBBLE_WORDS_CAP - 1);
    bubbleDue += (BUBBLE_RATE[0] + (BUBBLE_RATE[1] - BUBBLE_RATE[0]) * share) * seconds;
    while (bubbleDue >= 1) {
      bubbleDue -= 1;
      bubbles.push({
        x: 12 + Math.random() * (width - 24),
        y: HEIGHT - FLOOR,
        radius: 1.5 + Math.random() * 2.5,
        speed: 22 + Math.random() * 22,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }
  for (const bubble of bubbles) {
    bubble.y -= bubble.speed * seconds;
    bubble.x += Math.sin(clock * 2.5 + bubble.phase) * 8 * seconds;
  }
  bubbles = bubbles.filter((bubble) => bubble.y > -bubble.radius);
}

// Drawing

function draw(): void {
  if (context === null || width === 0) {
    return;
  }
  const still = reducedMotion.matches;
  drawWater(context, still);
  drawRays(context, still);
  drawFloor(context);
  drawPlants(context, false, still);
  drawShells(context);
  for (const layer of [0, 1] as const) {
    drawFishInLayer(context, layer, still);
  }
  drawBubbles(context);
  drawFishInLayer(context, 2, still);
  drawPlants(context, true, still);
}

/** The gradient drifts up and down slowly, so the water's colour shifts. */
function drawWater(ctx: CanvasRenderingContext2D, still: boolean): void {
  const drift = still ? 0 : Math.sin((clock * Math.PI * 2) / 9) * 16;
  const gradient = ctx.createLinearGradient(0, -24 + drift, 0, HEIGHT + 24 + drift);
  gradient.addColorStop(0, css(palette.waterTop));
  gradient.addColorStop(1, css(palette.waterBottom));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, HEIGHT);
}

function drawRays(ctx: CanvasRenderingContext2D, still: boolean): void {
  // Leaning like the prototype's, about 20 degrees, falling from the top left.
  const lean = HEIGHT * 0.36;
  for (const ray of RAYS) {
    const flicker = still ? 1 : 0.7 + 0.3 * Math.sin((clock * Math.PI * 2) / 5 + ray.phase);
    const left = ray.x * width;
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.85);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${palette.ray * flicker})`);
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(left, 0);
    ctx.lineTo(left + ray.width, 0);
    ctx.lineTo(left + ray.width + lean, HEIGHT);
    ctx.lineTo(left + lean, HEIGHT);
    ctx.closePath();
    ctx.fill();
  }
}

function drawFloor(ctx: CanvasRenderingContext2D): void {
  const top = HEIGHT - FLOOR;
  ctx.fillStyle = css(palette.floor);
  ctx.beginPath();
  ctx.moveTo(0, HEIGHT);
  for (let x = 0; x <= width + 16; x += 16) {
    ctx.lineTo(x, top + Math.sin(x / 70) * 3 + Math.sin(x / 23) * 1.5);
  }
  ctx.lineTo(width, HEIGHT);
  ctx.closePath();
  ctx.fill();
}

function drawPlants(ctx: CanvasRenderingContext2D, front: boolean, still: boolean): void {
  const growth = tank?.growth ?? 0;
  const water = mix(palette.waterTop, palette.waterBottom, 0.6);
  // Back plants sit behind the water's haze, like back fish.
  const colour = css(front ? palette.plant : mix(palette.plant, water, 0.3));
  ctx.fillStyle = colour;
  for (const plant of PLANTS) {
    if (plant.front !== front) {
      continue;
    }
    const size = sizeAt(plant.growth, growth);
    if (size < 0.02) {
      continue;
    }
    const random = seededRandom(plant.seed);
    const baseX = plant.x * width;
    const baseY = HEIGHT - FLOOR * 0.45;
    const tallest = (HEIGHT - FLOOR) * plant.height * size;
    for (let blade = 0; blade < plant.blades; blade += 1) {
      const height = tallest * (0.55 + 0.45 * random());
      const lean = (random() - 0.5) * 0.6 * height;
      const phase = random() * Math.PI * 2;
      const sway = still ? 0 : Math.sin(clock * 0.8 + phase) * 7 * (height / (HEIGHT - FLOOR));
      const x = baseX + (blade - (plant.blades - 1) / 2) * 4;
      const half = 2.5 + 1.5 * size;
      ctx.beginPath();
      ctx.moveTo(x - half, baseY);
      ctx.quadraticCurveTo(x + lean * 0.3 - half, baseY - height * 0.6, x + lean + sway, baseY - height);
      ctx.quadraticCurveTo(x + lean * 0.3 + half, baseY - height * 0.5, x + half, baseY);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** Piecewise straight lines between the points, flat beyond the ends. */
function sizeAt(points: readonly (readonly [number, number])[], growth: number): number {
  let previous: readonly [number, number] = [0, 0];
  for (const point of points) {
    if (growth <= point[0]) {
      const span = point[0] - previous[0];
      return span === 0 ? point[1] : previous[1] + ((growth - previous[0]) / span) * (point[1] - previous[1]);
    }
    previous = point;
  }
  return previous[1];
}

/** Left to right in the order the books were finished, closer together when there are many. */
function drawShells(ctx: CanvasRenderingContext2D): void {
  const count = Math.min(MAX_SHELLS, tank?.finished ?? 0);
  if (count === 0) {
    return;
  }
  const step = Math.min(34, (width - 32) / count);
  const ridge = css(mix(palette.shell, palette.floor, 0.55));
  for (let index = 0; index < count; index += 1) {
    const random = seededRandom(index + 101);
    const size = 8 + random() * 3;
    ctx.save();
    ctx.translate(16 + step * (index + 0.5), HEIGHT - FLOOR * 0.35);
    ctx.rotate((random() - 0.5) * 0.6);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.5);
    ctx.arc(0, size * 0.5, size, Math.PI + 0.35, -0.35);
    ctx.closePath();
    ctx.fillStyle = css(palette.shell);
    ctx.fill();
    ctx.strokeStyle = ridge;
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let line = 1; line < 5; line += 1) {
      const angle = Math.PI + 0.35 + ((Math.PI - 0.7) * line) / 5;
      ctx.beginPath();
      ctx.moveTo(0, size * 0.5);
      ctx.lineTo(Math.cos(angle) * size * 0.9, size * 0.5 + Math.sin(angle) * size * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawBubbles(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 1;
  for (const bubble of bubbles) {
    ctx.beginPath();
    ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawFishInLayer(ctx: CanvasRenderingContext2D, layer: Layer, still: boolean): void {
  for (const one of fish.values()) {
    if (one.layer === layer) {
      drawFish(ctx, one, still);
    }
  }
}

/**
 * A fish in its language's shape, nose to the right. It's drawn in the tail's
 * colour, then in the head's colour clipped to the head's share of its length, then
 * in the stripes' colour clipped to two bands across the body.
 */
function drawFish(ctx: CanvasRenderingContext2D, one: Fish, still: boolean): void {
  const length = lengthOf(one);
  const form = shapeOf(one);
  const nose = length * form.nose;
  const span = length * (form.nose - form.tailEnd);
  const wag = still ? 0 : Math.sin(clock * 7 + one.phase) * length * 0.05;
  const shape = form.body(length, wag);
  const { head, tail, stripes, split } = one.data;

  ctx.save();
  ctx.translate(one.x, one.y);
  // Turning round squeezes the fish to a sliver rather than flipping it at once.
  const facing = Math.sign(one.facing) * Math.max(0.12, Math.abs(one.facing));
  ctx.scale(facing === 0 ? 1 : facing, 1);
  ctx.rotate(one.tilt);
  // Outlines first, so the fill covers their inner half and the tail's seam. A
  // highlighted fish gets a light ring outside its usual dark one.
  if (isHighlighted(one) && emphasis > 0) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * emphasis})`;
    ctx.lineWidth = 5;
    ctx.stroke(shape);
  }
  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  ctx.lineWidth = 2;
  ctx.stroke(shape);
  ctx.fillStyle = colourOf(tail ?? head, one, still);
  ctx.fill(shape);
  if (tail !== null && split < 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(nose - split * span, -length, split * span + 1, length * 2);
    ctx.clip();
    ctx.fillStyle = colourOf(head, one, still);
    ctx.fill(shape);
    ctx.restore();
  }
  if (stripes !== null) {
    ctx.save();
    ctx.beginPath();
    for (const middle of STRIPES) {
      ctx.rect(nose - (middle + STRIPE_WIDTH / 2) * span, -length, STRIPE_WIDTH * span, length * 2);
    }
    ctx.clip();
    ctx.fillStyle = colourOf(stripes, one, still);
    ctx.fill(shape);
    ctx.restore();
  }
  const eye = Math.max(1.2, length * 0.05);
  const [eyeX, eyeY] = [length * form.eye[0], length * form.eye[1]];
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, eye, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.beginPath();
  ctx.arc(eyeX + eye * 0.35, eyeY - eye * 0.35, eye * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Colours

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const colour = (name: string, fallback: Rgb): Rgb => parseHex(style.getPropertyValue(name)) ?? fallback;
  const ray = Number.parseFloat(style.getPropertyValue("--aquarium-ray"));
  return {
    waterTop: colour("--aquarium-water-top", FALLBACK.waterTop),
    waterBottom: colour("--aquarium-water-bottom", FALLBACK.waterBottom),
    floor: colour("--aquarium-floor", FALLBACK.floor),
    books: FALLBACK.books.map((fallback, index) => colour(`--aquarium-book-${index + 1}`, fallback)),
    silver: colour("--aquarium-silver", FALLBACK.silver),
    plant: colour("--aquarium-plant", FALLBACK.plant),
    shell: colour("--aquarium-shell", FALLBACK.shell),
    ray: Number.isFinite(ray) ? clamp(ray, 0, 1) : FALLBACK.ray,
  };
}

function parseHex(value: string): Rgb | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value.trim());
  if (match === null) {
    return null;
  }
  return [
    Number.parseInt(match[1] ?? "0", 16),
    Number.parseInt(match[2] ?? "0", 16),
    Number.parseInt(match[3] ?? "0", 16),
  ];
}

/** `amount` of the way from `from` to `to`. */
function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

function css(colour: Rgb): string {
  return `rgb(${Math.round(colour[0])}, ${Math.round(colour[1])}, ${Math.round(colour[2])})`;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

// Seeded randomness, so the same day or plant always comes out the same.

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  }
  return value >>> 0;
}

/** Mulberry32: a tiny generator that gives the same numbers for the same seed. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
