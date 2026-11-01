/**
 * Counts GPU work the renderer issues each frame: bytes uploaded (buffers + textures) and pipeline/program creations
 * (= shader compiles, the classic first-sight hitch). Hooks WebGL2 prototypes or the WebGPU device in place; cheap.
 */
export const gpu = { uploadBytes: 0, uploadCalls: 0, compiles: 0, totalCompiles: 0, texBytes: 0, texCalls: 0, geoBytes: 0 };
const size = (a: any) => (a && a.byteLength) || 0;
export function installGpuHooks(backend: any) {
  const add = (b: number, tex = false) => { gpu.uploadBytes += b; gpu.uploadCalls++; if (tex) { gpu.texBytes += b; gpu.texCalls++; } else gpu.geoBytes += b; };
  const comp = () => { gpu.compiles++; gpu.totalCompiles++; };
  const device: GPUDevice | undefined = backend?.device;
  if (device) {
    const q = device.queue as any, wb = q.writeBuffer.bind(q), wt = q.writeTexture.bind(q);
    q.writeBuffer = (buf: any, off: number, data: any, dOff = 0, sz?: number) => { add(sz !== undefined ? sz * (data.BYTES_PER_ELEMENT ?? 1) : size(data) - dOff * (data.BYTES_PER_ELEMENT ?? 1)); return wb(buf, off, data, dOff, sz); };
    q.writeTexture = (...a: any[]) => { add(size(a[1]), true); return (wt as any)(...a); };
    if (q.copyExternalImageToTexture) { const ce = q.copyExternalImageToTexture.bind(q); q.copyExternalImageToTexture = (src: any, dst: any, sz: any) => { const w = sz?.width ?? sz?.[0] ?? 0, h = sz?.height ?? sz?.[1] ?? 0; add(w * h * 4, true); return ce(src, dst, sz); }; }
    const d = device as any;
    for (const k of ['createRenderPipeline', 'createRenderPipelineAsync', 'createComputePipeline', 'createComputePipelineAsync']) { const o = d[k].bind(d); d[k] = (...a: any[]) => { comp(); return o(...a); }; }
    return;
  }
  const P = WebGL2RenderingContext.prototype as any;
  { const o = P.bufferData; P.bufferData = function (...a: any[]) { add(typeof a[1] === 'number' ? a[1] : size(a[1])); return o.apply(this, a); }; }
  { const o = P.bufferSubData; P.bufferSubData = function (...a: any[]) { const d = a[2], bpe = d?.BYTES_PER_ELEMENT ?? 1; add(a[4] ? a[4] * bpe : size(d) - (a[3] ?? 0) * bpe); return o.apply(this, a); }; }
  for (const k of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D']) { const o = P[k]; P[k] = function (...a: any[]) { let b = 0; for (const x of a) b = Math.max(b, size(x)); if (!b) for (const x of a) if (x && x.width) b = x.width * x.height * 4; add(b, true); return o.apply(this, a); }; }
  { const o = P.linkProgram; P.linkProgram = function (...a: any[]) { comp(); return o.apply(this, a); }; }
}
export function resetGpuFrame() { gpu.uploadBytes = 0; gpu.uploadCalls = 0; gpu.compiles = 0; gpu.texBytes = 0; gpu.texCalls = 0; gpu.geoBytes = 0; }
