/** Values in SpriteStudio's SSBP version 3 binary format. */
export const PartType = { Null: 0, Normal: 1, Text: 2, Instance: 3, Effect: 4 } as const;
export const BlendMode = { Mix: 0, Multiply: 1, Add: 2, Subtract: 3 } as const;
export const PartFlags = {
  Invisible: 1,
  FlipX: 2,
  FlipY: 4,
  Cell: 8,
  X: 16,
  Y: 32,
  Z: 64,
  PivotX: 128,
  PivotY: 256,
  RotationX: 512,
  RotationY: 1024,
  RotationZ: 2048,
  ScaleX: 4096,
  ScaleY: 8192,
  Opacity: 16384,
  Color: 32768,
  Vertices: 65536,
  SizeX: 131072,
  SizeY: 262144,
  U: 524288,
  V: 1048576,
  UVRotation: 2097152,
  UScale: 4194304,
  VScale: 8388608,
  Radius: 16777216,
  InstanceKey: 33554432,
  InstanceStart: 67108864,
  InstanceEnd: 134217728,
  InstanceSpeed: 268435456,
  InstanceLoops: 536870912,
  InstanceFlags: 1073741824,
} as const;

export interface CellMap {
  name: string;
  imagePath: string;
  index: number;
  wrapMode: number;
  filterMode: number;
}
export interface Cell {
  name: string;
  cellMap: CellMap;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
}
export interface Part {
  name: string;
  index: number;
  parentIndex: number;
  type: number;
  boundsType: number;
  blendMode: number;
  reference: string;
  effect: string;
  colorLabel: string;
}
export interface Transform {
  cellIndex: number;
  x: number;
  y: number;
  z: number;
  opacity: number;
  pivotX: number;
  pivotY: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scaleX: number;
  scaleY: number;
  sizeX: number;
  sizeY: number;
  u: number;
  v: number;
  uvRotation: number;
  uScale: number;
  vScale: number;
  radius: number;
}
export interface InitialState extends Transform {
  index: number;
  flags: number;
}
export interface Animation {
  name: string;
  frameCount: number;
  fps: number;
  width: number;
  height: number;
  labels: { name: string; frame: number }[];
  initial: InitialState[];
  frameOffsets: number[];
  userDataOffsets: number[];
}
export interface AnimePack {
  name: string;
  parts: Part[];
  animations: Animation[];
}
export interface EffectBehavior {
  type: number;
  values: number[];
}
export interface EffectNode {
  index: number;
  parentIndex: number;
  type: number;
  cellIndex: number;
  blendMode: number;
  behaviors: EffectBehavior[];
}
export interface Effect {
  name: string;
  fps: number;
  lockSeed: boolean;
  seed: number;
  nodes: EffectNode[];
}
export interface Project {
  version: number;
  flags: number;
  imageBaseDir: string;
  byteLength: number;
  cells: Cell[];
  cellMaps: CellMap[];
  packs: AnimePack[];
  effects: Effect[];
}
export interface InstanceState {
  keyframe: number;
  start: number;
  end: number;
  speed: number;
  loops: number;
  flags: number;
}
/** TL, TR, BL, BR order; RGBA colors are normalized to 0..1. */
export interface DecodedPart extends Transform {
  part: Part;
  flags: number;
  visible: boolean;
  flipX: boolean;
  flipY: boolean;
  vertexOffsets: [number, number][];
  colors: [number, number, number, number][];
  colorBlend: number;
  instance: InstanceState;
}
export interface UserData {
  partIndex: number;
  integer?: number;
  rect?: number[];
  point?: number[];
  text?: string;
}
export interface DecodedFrame {
  frame: number;
  parts: DecodedPart[];
  userData: UserData[];
}
export interface Vertex {
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
  color: number[];
}
export interface DrawCommand {
  partIndex: number;
  partName: string;
  path: string;
  cellIndex: number;
  cellMap: CellMap;
  vertices: Vertex[];
  opacity: number;
  blendMode: number;
  colorBlend: number;
  /** Atlas coordinates in vertices are pixels. Normalize after image dimensions are known. */
  uvTransform: {
    flags: number;
    u: number;
    v: number;
    rotation: number;
    scaleU: number;
    scaleV: number;
  };
}
export interface EvaluatedPart {
  part: Part;
  state: DecodedPart;
  matrix: number[];
  visible: boolean;
}
export interface EvaluatedFrame {
  frame: number;
  pack: AnimePack;
  animation: Animation;
  parts: EvaluatedPart[];
  commands: DrawCommand[];
  userData: UserData[];
}
export interface EvaluateOptions {
  /** Hide a complete subtree using a path such as "body_anim/3". */
  hiddenParts?: ReadonlySet<string>;
  /** Elapsed seconds for independent instances; defaults to frame / animation FPS. */
  time?: number;
  /** Deterministic particle simulation seed. */
  seed?: number;
}
