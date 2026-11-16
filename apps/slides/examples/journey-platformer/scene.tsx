import type { ReactNode } from "react";
import { Bloom, Box, Card, Fog, JourneyStop, KeyLight, Material, RoundedBox, Sphere, Spray, Sprite, Tube,
  type Keyframe, type Vec3 } from "slides:journey/Journey";
import { BUTTERFLY, CRATE } from "./art";

/** The hero's feet at each step of the journey, counted across slides. */
const HERO: Vec3[] = [[-5, 0, 0], [21, 0, 0], [26, 3, 0], [48.6, 5, 0], [69, 0, 0], [91, 0, 0], [95.6, 0, 0]];
/** Which step collects each gem. */
const GEMS: { at: Vec3; step: number }[] = [
  ...[-1, 1, 3].map(x => ({ at: [x, 1.6, 0] as Vec3, step: 1 })),
  { at: [22, 6.4, 0], step: 2 },
  ...[51, 52.6, 54.2].map(x => ({ at: [x, 6.4, 0] as Vec3, step: 4 })),
  ...[74.5, 76, 77.5].map((x, i) => ({ at: [x, 2.4 + i * 1.5, 0] as Vec3, step: 5 })),
];
/** Seconds the camera takes between stops; untimed keyframes last as long. */
const FLIGHT = 1.4;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** A hop into each step's position: one keyframe per step, bowed by `arc`. */
const hop = (offset: Vec3): Keyframe<Vec3>[] => HERO.map((feet, step) => ({ step, value: add(feet, offset),
  arc: step ? 2 + Math.max(0, feet[1] - HERO[step - 1][1]) * 0.4 : 0 }));

// Original pixel art: a round, antennaed walker and a small bird.
const HERO_FRAMES = [[
  ".....yy.....",
  ".....kk.....",
  "...oooooo...",
  "..oooooooo..",
  ".oowwoowwoo.",
  ".oowkoowkoo.",
  ".oooooooooo.",
  ".oommmmmmoo.",
  ".ddoooooodd.",
  "..dddddddd..",
  "...bb..bb...",
  "..bbb..bbb..",
], [
  ".....yy.....",
  ".....kk.....",
  "...oooooo...",
  "..oooooooo..",
  ".oowwoowwoo.",
  ".oowkoowkoo.",
  ".oooooooooo.",
  ".oooommmooo.",
  ".ddoooooodd.",
  "..dddddddd..",
  "..bb....bb..",
  ".bbb....bbb.",
]];
const HERO_COLORS = { o: "#ff8a3d", d: "#d9622b", w: "#ffffff", k: "#1b1b2b", m: "#7a2e1d", y: "#ffd34d", b: "#5b3a29" };
const BIRD_FRAMES = [[
  "k......k",
  "kk....kk",
  ".kkwwkk.",
  "..wwwwr.",
  "...ww...",
], [
  "........",
  "........",
  ".kkwwkk.",
  "kkwwwwr.",
  "k..ww..k",
]];
const BIRD_COLORS = { k: "#2b3a55", w: "#f2f4f8", r: "#ff9f1c" };

function ground(): ReactNode[] {
  const tiles: ReactNode[] = [];
  for (let x = -18; x < 116; x += 2) {
    if (x >= 54 && x < 60) continue; // a pit under the ladder platform
    const top = (x / 2) % 2 === 0 ? "grass" : "grass2";
    tiles.push(<Box key={`top${x}`} id={`ground/top${x}`} position={[x + 1, -0.2, 0]} extent={[2, 0.4, 4]} material={top} />);
    tiles.push(<Box key={`dirt${x}`} id={`ground/dirt${x}`} position={[x + 1, -2.4, 0]} extent={[2, 4, 4]} material="dirt" />);
  }
  return tiles;
}

function backdrop(): ReactNode[] {
  const parts: ReactNode[] = [];
  // Far range: large, hazy spheres sunk into the ground.
  for (let i = 0; i < 9; i++) {
    const x = -30 + i * 19, r = 9 + (i * 7) % 5;
    parts.push(<Sphere key={`far${i}`} id={`far/${i}`} position={[x, -r * 0.35, -46]} size={r} scale={[1.3, 1, 0.6]} material="far" />);
  }
  // Near hills: rounder, greener, closer.
  for (let i = 0; i < 12; i++) {
    const x = -22 + i * 12 + (i % 3) * 2, r = 3 + (i % 3);
    parts.push(<Sphere key={`hill${i}`} id={`hill/${i}`} position={[x, -r * 0.3, -14]} size={r} scale={[1.4, 1, 0.8]} material="hill" />);
  }
  // Clouds: three flat white puffs each.
  for (let i = 0; i < 10; i++) {
    const c: Vec3 = [-20 + i * 15 + (i % 2) * 4, 13 + (i % 3) * 1.5, -26];
    [[-1.4, 0, 0, 1.2], [0, 0.5, 0.2, 1.6], [1.5, 0, 0, 1.1]].forEach(([dx, dy, dz, r], j) =>
      parts.push(<Sphere key={`cloud${i}-${j}`} id={`cloud${i}/${j}`} position={add(c, [dx, dy, dz])} size={r} scale={[1.3, 0.85, 0.8]} material="cloud" />));
  }
  // A bird crossing the sky on the step clock, flapping on its own.
  parts.push(<Sprite key="bird" id="bird" pixels={BIRD_FRAMES} palette={BIRD_COLORS} fps={4} size={0.9}
    position={HERO.map((feet, step) => ({ step, value: [feet[0] + 7, 8.5 + (step % 2) * 0.8, -2] as Vec3 }))} />);
  return parts;
}

function sign(id: string, x: number, title: string) {
  return [
    <Box key={`${id}/post`} id={`${id}/post`} position={[x, 1.2, -1]} extent={[0.3, 2.4, 0.3]} material="wood" />,
    <Card key={`${id}/board`} id={`${id}/board`} position={[x, 3, -0.9]} scale={[4.4, 1.3, 0.12]} flat color="#8a5a2b" textColor="#fff7e0"
      title={title} avatar={0} radius={0.18} weight="bold" />,
  ];
}

function gems(): ReactNode[] {
  // Gems spin on a loop until their step collects them.
  const spin: Keyframe<Vec3>[] = [{ step: 0, value: [0, 0, 45], loop: { every: 2.4, frames: [{ at: 0, value: [0, 360, 45], duration: 2.4, ease: "linear" }] } }];
  return GEMS.map(({ at, step }, i) => {
    // The gem inside the bonus block starts at zero scale and pops out on its step.
    const hidden = i === 3;
    const scale: Keyframe<Vec3>[] = hidden
      ? [{ step: 0, value: [0, 0, 0] }, { step, delay: FLIGHT / 2, duration: 0.65, value: [0.5, 0.5, 0.22] }, { step: step + 1, delay: FLIGHT / 2, duration: 0.25, value: [0, 0, 0] }]
      : [{ step: 0, value: [0.45, 0.45, 0.2] }, { step, delay: FLIGHT * 0.6, duration: 0.25, value: [0, 0, 0] }];
    const position: Keyframe<Vec3>[] | Vec3 = hidden ? [{ step: 0, value: add(at, [0, -2, 0]) }, { step, delay: FLIGHT / 2, duration: 0.65, value: at }] : at;
    return <Box key={`gem${i}`} id={`gem/${i}`} position={position} size={1} scale={scale} material="gem" rotation={spin} />;
  });
}

function stopOne(): ReactNode[] {
  // A row of bonus blocks and a floating platform.
  return [
    ...[20, 22, 24].map(x => <RoundedBox key={`bonus${x}`} id={`bonus/${x}`} position={[x, 4.5, 0]} size={0.5} scale={[1.6, 1.6, 1.6]} radius={0.1} edge={0}
      material={x === 22 ? "bonus" : "brick"} />),
    <Box key="bump" id="bonus/bump" position={[22, 4.5, 0.81]} extent={[0.5, 0.5, 0.02]} material="stud" />,
    <Box key="ledge1top" id="ledge1/top" position={[27, 2.75, 0]} extent={[5, 0.5, 2.4]} material="grass" />,
    <Box key="ledge1under" id="ledge1/under" position={[27, 2.15, 0]} extent={[5, 0.7, 2.4]} material="dirt" />,
  ];
}

function stopTwo(): ReactNode[] {
  return [
    ...[45.45, 46.55].map(x => <Tube key={`rail${x}`} id={`ladder/${x}`} position={[x, 0, 0.4]} end={[x, 5.2, 0.4]} thickness={0.08} material="wood" />),
    ...Array.from({ length: 7 }, (_, i) => <Box key={`rung${i}`} id={`ladder/rung${i}`} position={[46, 0.6 + i * 0.7, 0.4]} extent={[1.2, 0.14, 0.14]} material="wood" />),
    <Box key="ledge2top" id="ledge2/top" position={[51, 4.75, 0]} extent={[9, 0.5, 2.4]} material="grass2" />,
    <Box key="ledge2under" id="ledge2/under" position={[51, 4.05, 0]} extent={[9, 0.9, 2.4]} material="brick" />,
    ...[47.5, 54.5].map(x => <Box key={`leg${x}`} id={`ledge2/leg${x}`} position={[x, 1.8, -0.6]} extent={[0.6, 3.6, 0.6]} material="wood" />),
  ];
}

function stopThree(): ReactNode[] {
  // A staircase of image-mapped crates, and a butterfly drawn from an image strip.
  const steps: ReactNode[] = [];
  for (let col = 0; col < 4; col++) for (let row = 0; row <= col; row++)
    steps.push(<Box key={`stairs${col}-${row}`} id={`stairs/${col}-${row}`} position={[75 + col * 1.5, 0.75 + row * 1.5, 0]} extent={[1.5, 1.5, 1.5]}
      material={(col + row) % 2 ? "crate" : "crate2"} />);
  steps.push(<Sprite key="butterfly" id="butterfly" source={BUTTERFLY} frames={2} fps={6} size={0.4}
    position={[{ step: 0, value: [70, 3.5, 1] }, { step: 5, value: [73, 7.5, 1], arc: 1 }]} />);
  return steps;
}

function goal(): ReactNode[] {
  const x = 98, raised = HERO.length - 1;
  return [
    <Box key="goalbase" id="goal/base" position={[x, 0.4, 0]} extent={[1.6, 0.8, 1.6]} material="brick" />,
    <Tube key="goalpole" id="goal/pole" position={[x, 0.8, 0]} end={[x, 8.6, 0]} thickness={0.1} material="pole" />,
    <Sphere key="goaltop" id="goal/top" position={[x, 8.8, 0]} size={0.32} material="gold" />,
    <Box key="goalflag" id="goal/flag" extent={[2.2, 1.4, 0.08]} material="flag" position={{ 0: [x + 1.2, 1.8, 0], [raised]: [x + 1.2, 7.8, 0] }} />,
    <Spray key="confetti" id="goal/confetti" position={[x, 9, 0]} step={raised} rate={60} lifetime={2.2} size={0.08}
      spread={[2, 0.5, 1]} velocity={[0, 2.2, 0]} color="#ffd34d" />,
  ];
}

const scene: ReactNode[] = [
  <Material key="m-grass" id="grass" albedo="#5cc94a" />,
  <Material key="m-grass2" id="grass2" albedo="#4fb840" />,
  <Material key="m-dirt" id="dirt" albedo="#a8683a" />,
  <Material key="m-brick" id="brick" albedo="#c8553d" />,
  <Material key="m-bonus" id="bonus" albedo="#f4b63f" />,
  <Material key="m-stud" id="stud" albedo="#fff1c2" />,
  <Material key="m-wood" id="wood" albedo="#9a6634" />,
  <Material key="m-crate" id="crate" albedo="#ffffff" map={CRATE} />,
  <Material key="m-crate2" id="crate2" albedo="#e8e0d4" map={CRATE} />,
  <Material key="m-hill" id="hill" albedo="#3fa85a" />,
  <Material key="m-far" id="far" albedo="#8fb8e0" shading="flat" />,
  <Material key="m-cloud" id="cloud" albedo="#ffffff" shading="flat" />,
  <Material key="m-pole" id="pole" albedo="#e7edf5" />,
  <Material key="m-gold" id="gold" albedo="#ffd34d" />,
  <Material key="m-flag" id="flag" albedo="#ff4f7b" />,
  <Material key="m-gem" id="gem" albedo="#2ee6d6" emissive={0.4} />,
  ...backdrop(),
  ...ground(),
  ...sign("sign0", 4, "START"),
  ...sign("sign1", 17, "BLOCKS"),
  ...sign("sign2", 42, "CLIMB"),
  ...sign("sign3", 66, "DEPTH"),
  ...sign("sign4", 90, "GOAL"),
  ...stopOne(), ...stopTwo(), ...stopThree(), ...goal(),
  ...gems(),
  <Sprite key="hero" id="hero" pixels={HERO_FRAMES} palette={HERO_COLORS} fps={3} size={0.75} position={hop([0, 0.75, 0.6])} />,
  // Offsets from the camera target: the light and its shadow box travel with the view.
  <KeyLight key="key" follow="camera" position={[-14, 22.4, 18]} target={[0, -3.6, 0]} intensity={2.4} color="#fff4e0" shadowSize={18} />,
  <Fog key="fog" density={0.003} color="#bfe4ff" />,
  <Bloom key="bloom" intensity={0.25} threshold={1.2} />,
];

/** Every slide shows the same scene; the rail pans sideways one stop per slide and steps count across slides. */
export function Stop() {
  return <JourneyStop journey="platformer" clock="step" stepOffset="auto" keyframeDuration="flight" look="cartoon" buildDuration={FLIGHT}
    backgroundColor="#8fd3ff" quality="auto"
    track={{ frame: "world", advance: [1, 0, 0], spacing: 24, duration: FLIGHT, blur: 0, position: [0, 5.2, 21], target: [0, 3.6, 0] }}>
    {scene}
  </JourneyStop>;
}
