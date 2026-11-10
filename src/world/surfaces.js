// Ground surface types. Each one changes how the tyres behave.
//   mu    grip (friction coefficient). 1.0 = dry tarmac, 0.35 = slick mud
//   crr   rolling resistance: how much the ground drags on a rolling wheel
//   sink  how far (metres) the wheel sinks in, purely visual plus extra drag via crr
//   color voxel colour for the top of the ground
//   side  voxel colour for exposed sides

export const GRASS = 0;
export const DIRT = 1;
export const ROCK = 2;
export const MUD = 3;
export const SAND = 4;
export const RIVERBED = 5;
export const WOOD = 6;

export const SURFACES = [
  { name: 'Grass', rainLoss: 0.3, mu: 0.75, crr: 0.035, sink: 0.0, color: 0x52793a, side: 0x6b5238, dust: 0x6a8a4a },
  { name: 'Dirt', rainLoss: 0.35, mu: 0.85, crr: 0.025, sink: 0.0, color: 0x8c6b47, side: 0x6b5238, dust: 0xa58a66 },
  { name: 'Rock', airGain: 1.12, rainLoss: 0.15, mu: 0.95, crr: 0.02, sink: 0.0, color: 0x7b7d86, side: 0x5d5f68, dust: 0x9a9ca4 },
  { name: 'Mud', airGain: 1.2, rainLoss: 0.15, mu: 0.36, crr: 0.17, sink: 0.14, color: 0x4a3a2b, side: 0x3b2e22, dust: 0x3f3024 },
  { name: 'Sand', airGain: 1.3, mu: 0.55, crr: 0.09, sink: 0.07, color: 0xbfa676, side: 0x9c8660, dust: 0xd2bc8e },
  { name: 'Riverbed', airGain: 1.1, mu: 0.6, crr: 0.05, sink: 0.03, color: 0x6c6a58, side: 0x55533f, dust: 0x8fb0b0 },
  { name: 'Wood', mu: 0.8, crr: 0.02, sink: 0.0, color: 0x7a5234, side: 0x5a3c26, dust: 0x9a7a5a },
  { name: 'Glass ice', mu: 0.06, crr: 0.01, sink: 0.0, color: 0xcfe6ee, side: 0xa9c4cc, dust: 0xffffff }, // only used in tests
  // --- surfaces of the other maps ---
  { name: 'Gravel', kind: 'hard', mu: 0.74, crr: 0.03, sink: 0.0, color: 0x9a9082, side: 0x7a7266, dust: 0xb8ae9e },
  { name: 'Snow', kind: 'cold', mu: 0.45, crr: 0.06, sink: 0.07, airGain: 1.15, color: 0xe6edf2, side: 0xc4d0d9, dust: 0xffffff },
  { name: 'Packed snow', kind: 'cold', mu: 0.56, crr: 0.035, sink: 0.0, color: 0xcfd9e0, side: 0xb4c0c9, dust: 0xf2f6f8 },
  { name: 'Ice', kind: 'cold', mu: 0.14, crr: 0.012, sink: 0.0, color: 0xa9d6e6, side: 0x86b6c8, dust: 0xe8f6fb },
  { name: 'Desert sand', mu: 0.5, crr: 0.1, sink: 0.08, airGain: 1.3, color: 0xdba463, side: 0xb98549, dust: 0xe9bf85 },
  { name: 'Hardpack', kind: 'hard', mu: 0.8, crr: 0.026, sink: 0.0, color: 0xb9794c, side: 0x945c38, dust: 0xcf9668 },
  { name: 'Sandstone', kind: 'hard', mu: 0.92, crr: 0.02, sink: 0.0, airGain: 1.1, color: 0xb2583a, side: 0x8e4029, dust: 0xc9775a },
  { name: 'Lava rock', kind: 'hard', mu: 0.9, crr: 0.022, sink: 0.0, airGain: 1.1, color: 0x3d3638, side: 0x2a2526, dust: 0x5a5052 },
];
export const GRAVEL = 8, SNOW = 9, PACKED = 10, ICE = 11, DESERT = 12, HARDPACK = 13, SANDSTONE = 14, LAVAROCK = 15;

// Height of the water surface (the river). Anything below this is under water.
export const WATER_LEVEL = 0;

// Things about the world that can change while playing.
export const env = {
  waterLevel: WATER_LEVEL, // rain raises this
  wetness: 0, // 0 dry .. 1 soaked: makes dirt and grass slippery
  airDown: 1, // set per vehicle step: grip multiplier from tyre pressure
};

// Global knobs the tuning panel can change while the game runs.
export const physicsTuning = {
  gripScale: 1.0,
};
