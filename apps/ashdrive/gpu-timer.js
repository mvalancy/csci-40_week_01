// Asynchronous Auto Quality feedback and optional profiling. No blocking GPU waits.
// begin/end bracket one entire rendered frame, including postprocessing passes.
export function createGpuTimer(renderer, { now = () => performance.now() } = {}) {
  const native = renderer.backend?.isWebGPUBackend === true;
  let gl = null, extension = null, supported = false, reason = null;
  let frame = 0, sampledFrame = null, sampledAt = null, gpuMs = null, disposed = false;
  let lastSubmission = -Infinity, scheduledAt = null;
  let active = null, scheduled = false, nativePending = false, rejected = 0;
  const pending = [];
  const backend = native ? 'webgpu' : 'webgl2';
  if (native) {
    // r186 returns the sum of render passes for the LAST renderer frame in the
    // resolved batch, not the total of all accumulated frames (nor CPU time).
    supported = renderer.backend.trackTimestamp === true && renderer.hasFeature?.('timestamp-query') === true
      && typeof renderer.resolveTimestampsAsync === 'function' && typeof renderer.backend.getTimestampFrames === 'function';
    if (!supported) reason = 'WebGPU timestamp-query unavailable or trackTimestamp disabled';
  } else {
    try { gl = renderer.getContext?.(); extension = gl?.getExtension('EXT_disjoint_timer_query_webgl2'); supported = !!extension && typeof gl.createQuery === 'function'; }
    catch { supported = false; }
    if (!supported) reason = 'WebGL2 timer-query extension unavailable';
  }
  function deleteQuery(query) { try { gl.deleteQuery(query); } catch {} }
  function discard() {
    if (active) { try { gl.endQuery(extension.TIME_ELAPSED_EXT); } catch {} deleteQuery(active.query); active = null; }
    for (const entry of pending) deleteQuery(entry.query);
    rejected += pending.length; pending.length = 0; gpuMs = null; sampledFrame = null; sampledAt = null;
  }
  function poll() {
    if (!supported || native || disposed || pending.length === 0) return;
    try {
      if (gl.getParameter(extension.GPU_DISJOINT_EXT)) { discard(); return; }
      // Newest completed sample wins; results are only read after availability.
      for (let i = 0; i < pending.length;) {
        const entry = pending[i];
        if (entry.frame === frame || !gl.getQueryParameter(entry.query, gl.QUERY_RESULT_AVAILABLE)) { i++; continue; }
        const milliseconds = gl.getQueryParameter(entry.query, gl.QUERY_RESULT) / 1e6;
        if (Number.isFinite(milliseconds) && milliseconds >= 0 && (sampledFrame === null || entry.frame > sampledFrame)) { gpuMs = milliseconds; sampledFrame = entry.frame; sampledAt = entry.submittedAt; }
        deleteQuery(entry.query); pending.splice(i, 1);
      }
    } catch { discard(); supported = false; reason = 'WebGL timer-query failed or context was lost'; }
  }
  function begin() {
    if (disposed) return false;
    frame++; scheduled = false; poll();
    const time = now();
    if (!supported || active || time - lastSubmission < 250) return false;
    if (native) {
      scheduled = !nativePending;
      if (scheduled) { lastSubmission = time; scheduledAt = time; }
      return scheduled;
    }
    if (pending.length >= 4) return false;
    try {
      if (gl.getParameter(extension.GPU_DISJOINT_EXT)) { discard(); return false; }
      // Cooperate with any other profiler already timing this context.
      if (typeof gl.getQuery === 'function' && gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) return false;
      const query = gl.createQuery(); if (!query) return false;
      try { gl.beginQuery(extension.TIME_ELAPSED_EXT, query); }
      catch { deleteQuery(query); throw new Error('Unable to begin timer query'); }
      active = { query, frame, submittedAt: time }; lastSubmission = time; return true;
    } catch { supported = false; reason = 'WebGL timer query could not start'; return false; }
  }
  function end() {
    if (disposed || !supported) return;
    if (!native) {
      if (!active) return;
      try { gl.endQuery(extension.TIME_ELAPSED_EXT); pending.push(active); active = null; }
      catch { discard(); supported = false; reason = 'WebGL timer query could not finish'; }
      return;
    }
    if (!scheduled || nativePending) return;
    scheduled = false;
    const rendererFrame = renderer.info?.frame, requestFrame = frame, submittedAt = scheduledAt;
    if (!Number.isFinite(rendererFrame)) { supported = false; reason = 'Native frame identity unavailable'; return; }
    nativePending = true;
    Promise.resolve().then(() => {
      if (disposed) return null;
      return renderer.resolveTimestampsAsync('render');
    }).then(milliseconds => {
      if (disposed) return;
      const frames = renderer.backend.getTimestampFrames('render');
      // A failed native readback can return its previous cached duration. A
      // matching frame ID is required so that cached data isn't presented anew.
      if (frames[frames.length - 1] === rendererFrame && Number.isFinite(milliseconds) && milliseconds >= 0) { gpuMs = milliseconds; sampledFrame = requestFrame; sampledAt = submittedAt; }
      else rejected++;
    }).catch(() => { if (!disposed) { rejected++; reason = 'Native timestamp readback failed'; } })
      .finally(() => { nativePending = false; });
  }
  function sample() {
    poll();
    return { supported: supported && !disposed, backend, gpuMs, sampleId: sampledFrame, sampledFrame, ageSeconds: sampledAt === null ? null : Math.max(0, now() - sampledAt) / 1000, ageFrames: sampledFrame === null ? null : frame - sampledFrame,
      sampleFrames: gpuMs === null ? 0 : 1, pending: native ? Number(nativePending) : pending.length + Number(!!active), rejected,
      scope: native ? 'last-renderer-frame render passes' : 'one bracketed rendered frame', reason };
  }
  function dispose() { if (disposed) return; if (!native && gl) discard(); disposed = true; }
  return { begin, end, sample, dispose };
}
