import type { ReactNode } from "react";
import { Bloom, Box, Card, Environment, Fog, JourneyStop, KeyLight, Material, RoundedBox, Sphere, Spray, Tube,
  type Keyframe, type Vec3 } from "slides:journey/Journey";

/** Camera x for each slide; the scene is authored once in fixed coordinates and the camera slides sideways past it. */
export const STOPS = [0, 24, 48, 72, 96];
/** First beat of each slide: slides 2 and 5 have two builds. */
const FIRST_BEAT = [0, 1, 3, 4, 5];
const BEATS = 7;

/** The hero's feet per beat. */
const HERO: Vec3[] = [[-5, 0, 0], [21, 0, 0], [26, 3, 0], [48.6, 5, 0], [69, 0, 0], [91, 0, 0], [95.6, 0, 0]];
/** Which beat collects each gem. */
const GEMS: { at: Vec3; beat: number }[] = [
  ...[-1, 1, 3].map(x => ({ at: [x, 1.6, 0] as Vec3, beat: 1 })),
  { at: [22, 6.4, 0], beat: 2 },
  ...[51, 52.6, 54.2].map(x => ({ at: [x, 6.4, 0] as Vec3, beat: 4 })),
  ...[74.5, 76, 77.5].map((x, i) => ({ at: [x, 2.4 + i * 1.5, 0] as Vec3, beat: 5 })),
];

/** A step map with one value per beat. */
const beats = <T,>(value: (beat: number) => T): Record<number, T> =>
  Object.fromEntries(Array.from({ length: BEATS }, (_, beat) => [beat, value(beat)]));
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** Seconds the camera takes between stops; the hero's hop lasts as long. */
const FLIGHT = 1.4;
/** A parabolic hop into each beat, sampled at quarters with linear segments. */
function hop(offset: Vec3): Keyframe<Vec3>[] {
  const frames: Keyframe<Vec3>[] = [{ step: 0, value: add(HERO[0], offset) }];
  for (let beat = 1; beat < BEATS; beat++) {
    const from = HERO[beat - 1], to = HERO[beat], height = 2 + Math.max(0, to[1] - from[1]) * 0.4;
    for (let q = 1; q <= 4; q++) {
      const t = q / 4, y = from[1] + (to[1] - from[1]) * t + 4 * height * t * (1 - t);
      frames.push({ step: beat, delay: (q - 1) * FLIGHT / 4, duration: FLIGHT / 4, ease: "linear",
        value: add([from[0] + (to[0] - from[0]) * t, y, 0], offset) });
    }
  }
  return frames;
}

/** Boxes take a full-extent size: `size` 0.5 with `scale` as width, height and depth. */
function block(id: string, center: Vec3, extent: Vec3, material: string) {
  return <Box key={id} id={id} position={center} size={0.5} scale={extent} material={material} emissive={0} />;
}
/** Bevelled tiles read as separate blocks where plain boxes merge into one face. */
function tile(id: string, center: Vec3, extent: Vec3, material: string) {
  return <RoundedBox key={id} id={id} position={center} size={0.5} scale={extent} radius={0.1} edge={0} material={material} emissive={0} />;
}

function ground(): ReactNode[] {
  const tiles: ReactNode[] = [];
  for (let x = -18; x < 116; x += 2) {
    if (x >= 54 && x < 60) continue; // a pit under the ladder platform
    const top = (x / 2) % 2 === 0 ? "grass" : "grass2";
    tiles.push(block(`ground/top${x}`, [x + 1, -0.2, 0], [2, 0.4, 4], top));
    tiles.push(block(`ground/dirt${x}`, [x + 1, -2.4, 0], [2, 4, 4], "dirt"));
  }
  return tiles;
}

function backdrop(): ReactNode[] {
  const parts: ReactNode[] = [];
  // Far range: large, hazy spheres sunk into the ground.
  for (let i = 0; i < 9; i++) {
    const x = -30 + i * 19, r = 9 + (i * 7) % 5;
    parts.push(<Sphere key={`far${i}`} id={`far/${i}`} position={[x, -r * 0.35, -46]} size={r} scale={[1.3, 1, 0.6]} material="far" emissive={0} />);
  }
  // Near hills: rounder, greener, closer.
  for (let i = 0; i < 12; i++) {
    const x = -22 + i * 12 + (i % 3) * 2, r = 3 + (i % 3);
    parts.push(<Sphere key={`hill${i}`} id={`hill/${i}`} position={[x, -r * 0.3, -14]} size={r} scale={[1.4, 1, 0.8]} material="hill" emissive={0} />);
  }
  // Clouds: three puffs each, slightly self-lit so they stay white under the haze.
  for (let i = 0; i < 10; i++) {
    const c: Vec3 = [-20 + i * 15 + (i % 2) * 4, 13 + (i % 3) * 1.5, -26];
    [[-1.4, 0, 0, 1.2], [0, 0.5, 0.2, 1.6], [1.5, 0, 0, 1.1]].forEach(([dx, dy, dz, r], j) =>
      parts.push(<Sphere key={`cloud${i}-${j}`} id={`cloud${i}/${j}`} position={add(c, [dx, dy, dz])} size={r} scale={[1.3, 0.85, 0.8]} color="#ffffff" emissive={0.35} material="cloud" />));
  }
  return parts;
}

function sign(id: string, x: number, title: string) {
  return [
    block(`${id}/post`, [x, 1.2, -1], [0.3, 2.4, 0.3], "wood"),
    <Card key={`${id}/board`} id={`${id}/board`} position={[x, 3, -0.9]} scale={[4.4, 1.3, 0.12]} flat color="#8a5a2b" textColor="#fff7e0"
      title={title} avatar={0} radius={0.18} weight="bold" />,
  ];
}

function hero(): ReactNode[] {
  return [
    <RoundedBox key="body" id="hero/body" position={hop([0, 0.65, 0])} size={0.5} scale={[1.2, 1.3, 1]} radius={0.35} edge={0} color="#ff7a3d" emissive={0} material="hero" />,
    ...[-0.25, 0.25].flatMap(dx => [
      <Sphere key={`eye${dx}`} id={`hero/eye${dx}`} position={hop([dx, 0.9, 0.52])} size={0.17} color="#ffffff" emissive={0.2} material="eye" />,
      <Sphere key={`pupil${dx}`} id={`hero/pupil${dx}`} position={hop([dx + 0.04, 0.9, 0.66])} size={0.08} color="#1b1b2b" emissive={0} material="pupil" />,
    ]),
  ];
}

function gems(): ReactNode[] {
  return GEMS.map(({ at, beat }, i) => {
    // Hidden gems (the one inside the bonus block) start at zero scale and pop out on their beat.
    const hidden = i === 3;
    const scale: Keyframe<Vec3>[] = [{ step: 0, value: [0.45, 0.45, 0.2] }, { step: beat, delay: FLIGHT * 0.6, duration: 0.25, value: [0, 0, 0] }];
    if (hidden) scale.splice(0, 2, { step: 0, value: [0, 0, 0] }, { step: beat, delay: FLIGHT / 2, value: [0.5, 0.5, 0.22] }, { step: beat + 1, delay: FLIGHT / 2, value: [0, 0, 0] });
    const position: Keyframe<Vec3>[] | Vec3 = hidden ? [{ step: 0, value: add(at, [0, -2, 0]) }, { step: beat, delay: FLIGHT / 2, value: at }] : at;
    return <Box key={`gem${i}`} id={`gem/${i}`} position={position} size={1} scale={scale} color="#2ee6d6" emissive={0.9}
      rotation={[0, 0, 45]} />;
  });
}

function stopOne(): ReactNode[] {
  // A row of bonus blocks and a floating platform.
  return [
    ...[20, 22, 24].map(x => tile(`bonus/${x}`, [x, 4.5, 0], [1.6, 1.6, 1.6], x === 22 ? "bonus" : "brick")),
    block("bonus/bump", [22, 4.5, 0.81], [0.5, 0.5, 0.02], "stud"),
    block("ledge1/top", [27, 2.75, 0], [5, 0.5, 2.4], "grass"),
    block("ledge1/under", [27, 2.15, 0], [5, 0.7, 2.4], "dirt"),
  ];
}

function stopTwo(): ReactNode[] {
  const rungs = Array.from({ length: 7 }, (_, i) => block(`ladder/rung${i}`, [46, 0.6 + i * 0.7, 0.4], [1.2, 0.14, 0.14], "wood"));
  return [
    <Tube key="ladder/l" id="ladder/l" position={[45.45, 0, 0.4]} end={[45.45, 5.2, 0.4]} thickness={0.08} color="#a06a35" emissive={0} material="wood" />,
    <Tube key="ladder/r" id="ladder/r" position={[46.55, 0, 0.4]} end={[46.55, 5.2, 0.4]} thickness={0.08} color="#a06a35" emissive={0} material="wood" />,
    ...rungs,
    block("ledge2/top", [51, 4.75, 0], [9, 0.5, 2.4], "grass2"),
    block("ledge2/under", [51, 4.05, 0], [9, 0.9, 2.4], "brick"),
    ...[47.5, 54.5].map(x => block(`ledge2/leg${x}`, [x, 1.8, -0.6], [0.6, 3.6, 0.6], "wood")),
  ];
}

function stopThree(): ReactNode[] {
  // A staircase of crates.
  const steps: ReactNode[] = [];
  for (let col = 0; col < 4; col++) for (let row = 0; row <= col; row++)
    steps.push(tile(`stairs/${col}-${row}`, [75 + col * 1.5, 0.75 + row * 1.5, 0], [1.5, 1.5, 1.5], (col + row) % 2 ? "crate" : "crate2"));
  return steps;
}

function goal(): ReactNode[] {
  const x = 98;
  return [
    block("goal/base", [x, 0.4, 0], [1.6, 0.8, 1.6], "brick"),
    <Tube key="goal/pole" id="goal/pole" position={[x, 0.8, 0]} end={[x, 8.6, 0]} thickness={0.1} color="#e7edf5" emissive={0} material="pole" />,
    <Sphere key="goal/top" id="goal/top" position={[x, 8.8, 0]} size={0.32} color="#ffd34d" emissive={0.6} material="gold" />,
    <Box key="goal/flag" id="goal/flag" size={0.5} scale={[2.2, 1.4, 0.08]} material="flag" emissive={beats(b => b >= 6 ? 0.12 : 0)}
      position={beats<Vec3>(b => b >= 6 ? [x + 1.2, 7.8, 0] : [x + 1.2, 1.8, 0])} />,
    <Spray key="goal/confetti" id="goal/confetti" position={[x, 9, 0]} step={6} rate={60} lifetime={2.2} size={0.08}
      spread={[2, 0.5, 1]} velocity={[0, 2.2, 0]} color="#ffd34d" />,
  ];
}

const scene: ReactNode[] = [
  <Material key="m-grass" id="grass" albedo="#5cc94a" roughness={0.9} metal={0} rim={0} />,
  <Material key="m-grass2" id="grass2" albedo="#4fb840" roughness={0.9} metal={0} rim={0} />,
  <Material key="m-dirt" id="dirt" albedo="#a8683a" roughness={1} metal={0} rim={0} />,
  <Material key="m-brick" id="brick" albedo="#c8553d" roughness={0.85} metal={0} rim={0} />,
  <Material key="m-bonus" id="bonus" albedo="#f4b63f" roughness={0.6} metal={0} rim={0} />,
  <Material key="m-stud" id="stud" albedo="#fff1c2" roughness={0.6} metal={0} rim={0} />,
  <Material key="m-wood" id="wood" albedo="#9a6634" roughness={0.9} metal={0} rim={0} />,
  <Material key="m-crate" id="crate" albedo="#d29a52" roughness={0.9} metal={0} rim={0} />,
  <Material key="m-crate2" id="crate2" albedo="#bf8442" roughness={0.9} metal={0} rim={0} />,
  <Material key="m-hill" id="hill" albedo="#3fa85a" roughness={1} metal={0} rim={0} />,
  <Material key="m-far" id="far" albedo="#6e9fd0" roughness={1} metal={0} rim={0} />,
  <Material key="m-cloud" id="cloud" albedo="#ffffff" roughness={1} metal={0} rim={0} />,
  <Material key="m-hero" id="hero" albedo="#ff7a3d" roughness={0.5} metal={0} rim={0} />,
  <Material key="m-eye" id="eye" albedo="#ffffff" roughness={0.4} metal={0} rim={0} />,
  <Material key="m-pupil" id="pupil" albedo="#1b1b2b" roughness={0.4} metal={0} rim={0} />,
  <Material key="m-pole" id="pole" albedo="#e7edf5" roughness={0.3} metal={0.4} rim={0} />,
  <Material key="m-gold" id="gold" albedo="#ffd34d" roughness={0.3} metal={0.6} rim={0} />,
  <Material key="m-flag" id="flag" albedo="#ff4f7b" roughness={0.8} metal={0} rim={0} />,
  ...backdrop(),
  ...ground(),
  ...sign("sign0", 4, "START"),
  ...sign("sign1", 17, "BLOCKS"),
  ...sign("sign2", 42, "CLIMB"),
  ...sign("sign3", 66, "DEPTH"),
  ...sign("sign4", 90, "GOAL"),
  ...stopOne(), ...stopTwo(), ...stopThree(), ...goal(),
  ...gems(),
  ...hero(),
  <KeyLight key="key" position={beats<Vec3>(b => [HERO[b][0] - 14, 26, 18])} target={beats<Vec3>(b => [HERO[b][0], 0, 0])}
    intensity={2.4} color="#fff4e0" shadowSize={18} softness={2} shadowStrength={0.55} />,
  <Environment key="env" intensity={1} />,
  <Fog key="fog" density={0.006} color="#bfe4ff" />,
  <Bloom key="bloom" intensity={0.25} threshold={1.2} />,
];

/** Beats run across the deck: a slide's local step `step` is beat FIRST_BEAT[slide] + step. */
export function Stop({ slide }: { slide: number }) {
  const x = STOPS[slide];
  // The rail always advances in depth; tiny spacing plus a matching camera z keeps it a pure sideways pan.
  const spacing = 0.01, z = slide * spacing;
  return <JourneyStop journey="platformer" clock="step" stepOffset={FIRST_BEAT[slide]} buildDuration={FLIGHT}
    backgroundColor="#8fd3ff" toneMapping="neutral" exposure={1.05} quality="auto"
    track={{ frame: "world", spacing, duration: FLIGHT, blur: 0, position: [x, 5.2, 21 + z], target: [x, 3.6, z] }}>
    {scene}
  </JourneyStop>;
}
