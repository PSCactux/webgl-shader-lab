import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export type EffectMeta = {
  slug: string;
  title: string;
  /** One line for the gallery card. */
  summary: string;
  /** How to interact, shown on the effect page. */
  hint: string;
  tags: string[];
  component: LazyExoticComponent<ComponentType>;
};

/** Every effect is its own chunk, loaded only when its page is opened. */
export const EFFECTS: EffectMeta[] = [
  {
    slug: "liquid-metal",
    title: "Liquid Metal",
    summary: "Raymarched metaballs that melt into each other through a smooth minimum.",
    hint: "move the pointer: one drop follows it",
    tags: ["raymarching", "SDF", "smooth-min"],
    component: lazy(() => import("./LiquidMetal")),
  },
  {
    slug: "curl-swarm",
    title: "Curl Swarm",
    summary: "65k particles simulated on the GPU, drifting through a curl-noise field.",
    hint: "press and hold to pull the swarm",
    tags: ["GPGPU", "curl noise", "particles"],
    component: lazy(() => import("./CurlSwarm")),
  },
  {
    slug: "particle-morph",
    title: "Particle Morph",
    summary: "90k particles that assemble into any word, morphing in the vertex shader.",
    hint: "move the pointer through the particles · type a word in the panel",
    tags: ["particles", "vertex shader", "text sampling"],
    component: lazy(() => import("./ParticleMorph")),
  },
  {
    slug: "terrain",
    title: "Wireframe Terrain",
    summary: "An FBM landscape displaced on the GPU every frame from a flat plane.",
    hint: "move the pointer to fly over it",
    tags: ["FBM noise", "vertex displacement"],
    component: lazy(() => import("./Terrain")),
  },
  {
    slug: "glass",
    title: "Glass",
    summary: "Refraction, thickness and chromatic dispersion with a hand-built studio environment.",
    hint: "drag to orbit",
    tags: ["transmission", "PBR", "environment"],
    component: lazy(() => import("./Glass")),
  },
  {
    slug: "tunnel",
    title: "Tunnel",
    summary: "An endless flight along a closed spline tube; speed comes from the shader.",
    hint: "move the pointer to tilt the flight",
    tags: ["TubeGeometry", "spline camera"],
    component: lazy(() => import("./Tunnel")),
  },
  {
    slug: "portal",
    title: "Portal",
    summary: "A polar-coordinate vortex with GPU particles spiralling into its core.",
    hint: "click to fly through it",
    tags: ["polar shader", "GPU particles"],
    component: lazy(() => import("./Portal")),
  },
  {
    slug: "contours",
    title: "Topographic Contours",
    summary: "Iso-lines of a noise height field, anti-aliased with screen-space derivatives.",
    hint: "move the pointer: a hill follows it · hold to raise it",
    tags: ["FBM noise", "fwidth", "iso-lines"],
    component: lazy(() => import("./Contours")),
  },
  {
    slug: "aurora",
    title: "Aurora Gradient",
    summary: "Domain-warped FBM: noise fed into noise for a slowly flowing gradient.",
    hint: "move the pointer to stir the flow",
    tags: ["domain warping", "FBM noise"],
    component: lazy(() => import("./Aurora")),
  },
  {
    slug: "vhs",
    title: "VHS Tape",
    summary: "A procedural scene run through a CRT/VHS pass: curvature, chroma bleed, tracking noise.",
    hint: "click to rewind",
    tags: ["post-processing", "CRT", "procedural"],
    component: lazy(() => import("./Vhs")),
  },
  {
    slug: "warp",
    title: "Warp Speed",
    summary: "A starfield of instanced streaks projected in the vertex shader.",
    hint: "pointer height is the throttle: up to accelerate",
    tags: ["instancing", "perspective divide"],
    component: lazy(() => import("./Warp")),
  },
  {
    slug: "wave-field",
    title: "Wave Field",
    summary: "A mesh of lines that ripples on its own and gets pushed around by the pointer.",
    hint: "move the pointer through the lines · click for a ripple",
    tags: ["vertex shader", "lines"],
    component: lazy(() => import("./WaveField")),
  },
  {
    slug: "gears",
    title: "Gear Train",
    summary: "Procedurally extruded gears with correct ratios and tooth phase alignment.",
    hint: "drag sideways or scroll to drive the train",
    tags: ["ExtrudeGeometry", "PBR metal"],
    component: lazy(() => import("./Gears")),
  },
  {
    slug: "constellation",
    title: "Constellation",
    summary: "Drifting nodes that link when close and reach out to the pointer.",
    hint: "move the pointer among the nodes",
    tags: ["dynamic buffers", "points & lines"],
    component: lazy(() => import("./Constellation")),
  },
];
