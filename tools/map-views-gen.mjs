// Generates tools/map-views.json: fixed camera spots per area for before/after comparison.
// node tools/map-views-gen.mjs   (positions are world metres around each area origin: x east, y up, z south)
import fs from 'node:fs';
const V = [];
const add = (name, area, pos, look, hold) => V.push({ name, area, pos, look, ...(hold ? { hold } : {}) });
// --- Newark Penn Station sits ~120 m inside the SE corner of the baked ground (x 1822, z 4095). Void past that edge.
const penn = [1704, 0, 3962];
add('newark-penn-edge-street-S', 'newark', [1690, 4, 3990], [1700, 3, 4400]);
add('newark-penn-edge-street-E', 'newark', [1700, 4, 3960], [2200, 3, 3960]);
add('newark-penn-edge-street-SE', 'newark', [1650, 4, 3900], [2100, 3, 4350]);
add('newark-penn-edge-mid-S', 'newark', [1700, 90, 3800], [1700, 20, 4300]);
add('newark-penn-edge-mid-E', 'newark', [1500, 90, 3960], [2100, 20, 3960]);
add('newark-penn-edge-mid-SE', 'newark', [1450, 120, 3700], [2000, 10, 4300]);
add('newark-penn-edge-high-S', 'newark', [1700, 1500, 3000], [1700, 0, 4600]);
add('newark-penn-edge-high-E', 'newark', [800, 1500, 3960], [2600, 0, 3960]);
add('newark-penn-edge-high-SE', 'newark', [900, 1500, 3000], [2300, 0, 4500]);
add('newark-penn-edge-max-S', 'newark', [1700, 5900, 3400], [1700, 0, 5200]);
add('newark-penn-edge-max-SE', 'newark', [1000, 5900, 2800], [2200, 0, 4700]);
add('newark-penn-edge-max-horizon-S', 'newark', [1700, 5900, 3000], [1700, 5000, 9000]);
add('newark-penn-edge-max-horizon-E', 'newark', [1000, 5900, 3960], [8000, 5000, 3960]);
add('newark-penn-edge-low-W', 'newark', [2400, 30, 4400], [1704, 15, 3962]);
// --- Newark overview and the other three edges
add('newark-aerial', 'newark', [650, 360, 650], [0, 0, 0]);
add('newark-overview-N', 'newark', [200, 900, 3300], [0, 0, -900]);
add('newark-edge-N-high', 'newark', [0, 1500, -500], [0, 0, -2000]);
add('newark-edge-W-high', 'newark', [0, 1500, 1500], [-2000, 0, 1500]);
add('newark-edge-E-mid', 'newark', [1400, 80, 800], [2200, 10, 800]);
// --- Key West: overview + shoreline/docks
add('keywest-aerial', 'keywest', [650, 420, 700], [-900, 0, -1300]);
add('keywest-oldtown', 'keywest', [-520, 140, -760], [-1050, 0, -1350]);
add('keywest-shore-S', 'keywest', [-300, 60, -200], [-300, 0, 600]);
add('keywest-shore-N', 'keywest', [-1000, 90, -1900], [-1000, 0, -2700]);
add('keywest-harbor-docks', 'keywest', [-1100, 45, -2150], [-1400, 0, -2500]);
add('keywest-edge-high-W', 'keywest', [-1300, 1400, -1300], [-4000, 0, -1300]);
add('keywest-edge-max-E', 'keywest', [0, 5900, -1300], [4500, 0, -1300]);
// --- Highlands / Bayshore
add('bayshore-aerial', 'bayshore', [500, 260, 300], [-700, 0, -1300]);
add('bayshore-shore', 'bayshore', [-200, 60, -300], [-600, 0, -900]);
add('bayshore-edge-N-high', 'bayshore', [-800, 1300, -1000], [-800, 0, -3200]);
add('bayshore-edge-max-W', 'bayshore', [0, 5900, -1000], [-4000, 0, -1000]);
// --- Sandy Hook
add('sandyhook-aerial', 'sandyhook', [900, 420, 1300], [-200, 0, -600]);
add('sandyhook-shore', 'sandyhook', [400, 50, 500], [900, 0, 900]);
add('sandyhook-edge-high-S', 'sandyhook', [0, 1500, 2500], [0, 0, 5000]);
// --- Passaic
add('passaic-aerial', 'passaic', [-600, 320, 800], [150, 0, -150]);
add('passaic-dock', 'passaic', [0, 30, 0], [0, 0, 0]);
add('passaic-edge-high-S', 'passaic', [0, 1200, 800], [0, 0, 2600]);
fs.writeFileSync('tools/map-views.json', JSON.stringify(V, null, 1));
console.log(V.length, 'views');
