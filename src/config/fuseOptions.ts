/**
 * Shared Fuse options (keys + base settings). Only keys are critical for index compatibility.
 * Runtime will adjust dynamic parameters (threshold, distance, etc.) depending on query strategy.
 */
import type { IFuseOptions } from 'fuse.js';
// Keys live in a JSON file so scripts/generate-fuse-index.cjs builds the
// prebuilt index with exactly the same keys (and order) as the runtime.
import fuseKeys from './fuseKeys.json';

export interface FuseRuntimeTuning {
  strictThreshold: number; // first pass
  relaxedThreshold: number; // fallback pass
  maxRelaxedResults: number; // cap for relaxed
}

export const tagFuseKeys: NonNullable<IFuseOptions<unknown>['keys']> = fuseKeys.tags;

// Base (will be merged/spread & tweaked at runtime)
export const baseTagFuseOptions: IFuseOptions<unknown> = {
  keys: tagFuseKeys,
  includeScore: true,
  shouldSort: true,
  ignoreLocation: false, // Enable location-based scoring to prioritize left-to-right matches
  location: 0, // Start searching from the beginning of the string
  minMatchCharLength: 1,
  distance: 80, // Reduced distance to favor matches closer to the start
  useExtendedSearch: true,
  threshold: 0.20, // Reducido de 0.28 para mayor precisión
  isCaseSensitive: false,
  findAllMatches: false
};


export const fuseRuntimeTuning: FuseRuntimeTuning = {
  strictThreshold: 0.20, // Reducido de 0.25 para mayor precisión en primera pasada
  relaxedThreshold: 0.45, // Reducido de 0.48 para mantener calidad en fallback
  maxRelaxedResults: 200
};

// Ranking weight defaults (can be overridden via message from main thread)
export interface RankingWeights {
  level: number; // multiplier for level (added as level * level)
  fuseScore: number; // multiplier for raw fuse score
  popularity: number; // multiplier for log10(postCount+1)
  groupBoost: number; // negative number boosts groups when added (applied if item is group)
  aliasPenalty: number; // penalty if matched via alias only
}

export const defaultRankingWeights: RankingWeights = {
  level: 1.2, // Aumentado de 1.0 para dar más peso a nivel de coincidencia
  fuseScore: 0.8, // Aumentado de 0.7 para valorar más la puntuación de Fuse
  popularity: -0.45, // Ajustado de -0.55 para balancear relevancia vs popularidad
  groupBoost: -0.15,
  aliasPenalty: 0.3 // Reducido de 0.4 para penalizar menos los aliases
};
