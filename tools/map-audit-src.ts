// Bundle entry for tools/map-audit.mjs: re-exports the REAL runtime modules so the audit measures the geometry the game builds.
import './map-audit-stub';
export { decodeTerrain, makeTerrain } from '../src/area/data';
export { buildBuildings } from '../src/area/buildings';
export { buildTerrain, buildRoads, buildPoolsPiers } from '../src/area/ground';
export { flattenUnderLandmarks, cullUnderLandmarks } from '../src/area/landmarks';
export { styleFor } from '../src/area/textures';
