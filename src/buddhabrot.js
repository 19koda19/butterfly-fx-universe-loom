(function registerBuddhabrotRenderer(root) {
  'use strict';

  const MAX_ITERATIONS = 220;
  const DEFAULT_ITERATIONS = 180;
  const DEFAULT_ACCUMULATION_SIZE = 1024;
  const TARGET_BATCH_VERTICES = 49152;
  const MAX_BATCH_VERTICES = 65536;
  const MAX_BATCH_CANDIDATES = 65536;
  const DEFAULT_SEED = 0x0b0dda7a;
  const UINT32_RANGE = 4294967296;

  // c is sampled uniformly from the familiar Mandelbrot parameter window.
  // Escaped z-orbits are accumulated in the canonical [-2, 2]^2 orbit plane.
  const SAMPLE_MIN_X = -2;
  const SAMPLE_SPAN_X = 3;
  const SAMPLE_MIN_Y = -1.5;
  const SAMPLE_SPAN_Y = 3;
  const ORBIT_PLANE_CENTER_X = 0;
  const ORBIT_PLANE_CENTER_Y = 0;
  const ORBIT_PLANE_HALF_SPAN = 2;

  const ACCUMULATION_VERTEX_SHADER = `#version 300 es
    precision highp float;

    in vec2 aOrbit;
    in float aGate;

    uniform vec2 uPlaneCenter;
    uniform float uPlaneHalfSpan;

    out float vGate;

    void main() {
      vec2 clip = (aOrbit - uPlaneCenter) / uPlaneHalfSpan;
      gl_Position = vec4(clip, 0.0, 1.0);
      gl_PointSize = 1.0;
      vGate = aGate;
    }
  `;

  const ACCUMULATION_FRAGMENT_SHADER = `#version 300 es
    precision highp float;

    in float vGate;
    uniform bool uFloatAccumulation;
    out vec4 fragmentColor;

    void main() {
      if (uFloatAccumulation) {
        fragmentColor = vec4(1.0);
        return;
      }

      // RGBA8 cannot represent fractional increments below one code value.
      // Nested deterministic lanes extend its useful count range: R records
      // every hit, then G/B/A record 1/8, 1/64, and 1/512 subsamples.
      const float unit = 1.0 / 255.0;
      fragmentColor = vec4(
        unit,
        vGate < 0.125 ? unit : 0.0,
        vGate < 0.015625 ? unit : 0.0,
        vGate < 0.001953125 ? unit : 0.0
      );
    }
  `;

  const DISPLAY_VERTEX_SHADER = `#version 300 es
    precision highp float;

    in vec2 aPosition;
    out vec2 vUv;

    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
      vUv = aPosition * 0.5 + 0.5;
    }
  `;

  const DISPLAY_FRAGMENT_SHADER = `#version 300 es
    precision highp float;
    precision highp int;

    in vec2 vUv;

    uniform sampler2D uDensity;
    uniform vec2 uViewCenter;
    uniform float uViewScale;
    uniform float uAspect;
    uniform vec2 uPlaneCenter;
    uniform float uPlaneHalfSpan;
    uniform bool uFloatAccumulation;
    uniform float uSamples;

    out vec4 fragmentColor;

    float decodeDensity(vec4 encoded) {
      if (uFloatAccumulation) return encoded.r;

      float count1 = encoded.r * 255.0;
      float count8 = encoded.g * 255.0 * 8.0;
      float count64 = encoded.b * 255.0 * 64.0;
      float count512 = encoded.a * 255.0 * 512.0;

      float density = count1;
      density = mix(density, count8, smoothstep(190.0, 248.0, count1));
      density = mix(density, count64, smoothstep(1520.0, 1984.0, density));
      density = mix(density, count512, smoothstep(12160.0, 15872.0, density));
      return density;
    }

    float densityAt(ivec2 coordinate) {
      ivec2 size = textureSize(uDensity, 0);
      ivec2 safeCoordinate = clamp(coordinate, ivec2(0), size - ivec2(1));
      return decodeDensity(texelFetch(uDensity, safeCoordinate, 0));
    }

    float filteredDensity(vec2 uv) {
      vec2 size = vec2(textureSize(uDensity, 0));
      vec2 texel = uv * size - 0.5;
      ivec2 base = ivec2(floor(texel));
      vec2 fraction = fract(texel);
      float a = densityAt(base);
      float b = densityAt(base + ivec2(1, 0));
      float c = densityAt(base + ivec2(0, 1));
      float d = densityAt(base + ivec2(1, 1));
      return mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
    }

    vec3 buddhabrotPalette(float value) {
      vec3 deep = vec3(0.018, 0.025, 0.075);
      vec3 violet = vec3(0.22, 0.12, 0.48);
      vec3 cyan = vec3(0.08, 0.62, 0.72);
      vec3 amber = vec3(1.0, 0.62, 0.22);
      vec3 whiteHot = vec3(1.0, 0.93, 0.78);
      vec3 color = mix(deep, violet, smoothstep(0.0, 0.3, value));
      color = mix(color, cyan, smoothstep(0.2, 0.58, value));
      color = mix(color, amber, smoothstep(0.52, 0.82, value));
      return mix(color, whiteHot, smoothstep(0.8, 1.0, value));
    }

    void main() {
      // Screen y grows downward to match the app's {x, y, scale, aspect}
      // camera convention. Texture y still follows the complex orbit plane.
      vec2 screenUv = vec2(vUv.x, 1.0 - vUv.y);
      vec2 world = uViewCenter
        + (screenUv - 0.5) * vec2(uViewScale * uAspect, uViewScale);
      vec2 densityUv = (world - (uPlaneCenter - uPlaneHalfSpan))
        / (uPlaneHalfSpan * 2.0);

      if (any(lessThan(densityUv, vec2(0.0)))
        || any(greaterThan(densityUv, vec2(1.0)))) {
        fragmentColor = vec4(0.0025, 0.004, 0.012, 1.0);
        return;
      }

      float density = filteredDensity(densityUv);
      if (density <= 0.0) {
        fragmentColor = vec4(0.0025, 0.004, 0.012, 1.0);
        return;
      }

      // Counts grow linearly, while exposure falls with sqrt(sample count).
      // The image therefore gains structure progressively without flashing
      // white after a few batches.
      float exposure = clamp(sqrt(5200.0 / max(1.0, uSamples)), 0.018, 1.35);
      float logarithmic = log(1.0 + density * exposure);
      float tone = 1.0 - exp(-logarithmic * 0.72);
      vec3 color = buddhabrotPalette(tone) * (0.2 + tone * 0.95);
      color = pow(max(color, 0.0), vec3(0.88));
      fragmentColor = vec4(color, 1.0);
    }
  `;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function finiteOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function mix32(input) {
    let value = input >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return value >>> 0;
  }

  function hashUnit(value) {
    return mix32(value) / UINT32_RANGE;
  }

  function compileShader(gl, type, source, label) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error(`Unable to create ${label} shader.`);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const detail = gl.getShaderInfoLog(shader) || 'Unknown shader compiler error.';
      gl.deleteShader(shader);
      throw new Error(`${label} shader failed: ${detail}`);
    }
    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource, label) {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource, `${label} vertex`);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label} fragment`);
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      throw new Error(`Unable to create ${label} program.`);
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const detail = gl.getProgramInfoLog(program) || 'Unknown shader linker error.';
      gl.deleteProgram(program);
      throw new Error(`${label} program failed: ${detail}`);
    }
    return program;
  }

  function isAnalyticInterior(cx, cy) {
    const bulbX = cx + 1;
    if (bulbX * bulbX + cy * cy <= 0.0625) return true;
    const cardioidX = cx - 0.25;
    const q = cardioidX * cardioidX + cy * cy;
    return q * (q + cardioidX) <= 0.25 * cy * cy;
  }

  class BuddhabrotRenderer {
    constructor(options = {}) {
      this.canvas = options.canvas || (root.document ? root.document.createElement('canvas') : null);
      this.supported = false;
      this.error = null;
      this.samples = 0;
      this.escapedSamples = 0;
      this.orbitPoints = 0;
      this.batches = 0;

      this._destroyed = false;
      this._seed = (finiteOr(Number(options.seed), DEFAULT_SEED) >>> 0);
      this._requestedAccumulationSize = clamp(
        Math.round(finiteOr(Number(options.accumulationSize), DEFAULT_ACCUMULATION_SIZE)),
        256,
        4096
      );
      this._iterations = null;
      this._lastBatchHash = null;
      this._floatAccumulation = false;
      this._accumulationFormat = null;
      this._accumulationSize = 0;
      this._vertexScratch = new Float32Array(MAX_BATCH_VERTICES * 3);
      this._orbitXScratch = new Float64Array(MAX_ITERATIONS);
      this._orbitYScratch = new Float64Array(MAX_ITERATIONS);

      this._onContextLost = (event) => {
        event.preventDefault();
        this.supported = false;
        this.error = 'WebGL2 context lost; waiting for restoration.';
      };
      this._onContextRestored = () => {
        if (this._destroyed) return;
        try {
          this._initializeResources();
          this.reset();
          this.supported = true;
          this.error = null;
        } catch (error) {
          this.supported = false;
          this.error = error instanceof Error ? error.message : String(error);
        }
      };

      if (!this.canvas || typeof this.canvas.getContext !== 'function') {
        this.error = 'BuddhabrotRenderer requires an HTML canvas or a DOM environment.';
        return;
      }

      this.canvas.addEventListener?.('webglcontextlost', this._onContextLost, false);
      this.canvas.addEventListener?.('webglcontextrestored', this._onContextRestored, false);

      try {
        this.gl = this.canvas.getContext('webgl2', {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: false,
          powerPreference: 'high-performance',
          desynchronized: true
        });
        if (!this.gl) throw new Error('WebGL2 is unavailable.');
        this._initializeResources();
        this.reset();
        this.supported = true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        this.supported = false;
        this._deleteResources();
      }
    }

    _initializeResources() {
      const gl = this.gl;
      if (!gl || gl.isContextLost()) throw new Error('WebGL2 context is unavailable.');
      this._deleteResources();

      this._accumulationProgram = createProgram(
        gl,
        ACCUMULATION_VERTEX_SHADER,
        ACCUMULATION_FRAGMENT_SHADER,
        'Buddhabrot accumulation'
      );
      this._displayProgram = createProgram(
        gl,
        DISPLAY_VERTEX_SHADER,
        DISPLAY_FRAGMENT_SHADER,
        'Buddhabrot display'
      );

      this._accumulationLocations = {
        orbit: gl.getAttribLocation(this._accumulationProgram, 'aOrbit'),
        gate: gl.getAttribLocation(this._accumulationProgram, 'aGate'),
        planeCenter: gl.getUniformLocation(this._accumulationProgram, 'uPlaneCenter'),
        planeHalfSpan: gl.getUniformLocation(this._accumulationProgram, 'uPlaneHalfSpan'),
        floatAccumulation: gl.getUniformLocation(this._accumulationProgram, 'uFloatAccumulation')
      };
      this._displayLocations = {
        position: gl.getAttribLocation(this._displayProgram, 'aPosition'),
        density: gl.getUniformLocation(this._displayProgram, 'uDensity'),
        viewCenter: gl.getUniformLocation(this._displayProgram, 'uViewCenter'),
        viewScale: gl.getUniformLocation(this._displayProgram, 'uViewScale'),
        aspect: gl.getUniformLocation(this._displayProgram, 'uAspect'),
        planeCenter: gl.getUniformLocation(this._displayProgram, 'uPlaneCenter'),
        planeHalfSpan: gl.getUniformLocation(this._displayProgram, 'uPlaneHalfSpan'),
        floatAccumulation: gl.getUniformLocation(this._displayProgram, 'uFloatAccumulation'),
        samples: gl.getUniformLocation(this._displayProgram, 'uSamples')
      };

      this._accumulationBuffer = gl.createBuffer();
      this._accumulationVao = gl.createVertexArray();
      if (!this._accumulationBuffer || !this._accumulationVao) {
        throw new Error('Unable to allocate Buddhabrot point geometry.');
      }
      gl.bindVertexArray(this._accumulationVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._accumulationBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this._vertexScratch.byteLength, gl.STREAM_DRAW);
      gl.enableVertexAttribArray(this._accumulationLocations.orbit);
      gl.vertexAttribPointer(this._accumulationLocations.orbit, 2, gl.FLOAT, false, 12, 0);
      gl.enableVertexAttribArray(this._accumulationLocations.gate);
      gl.vertexAttribPointer(this._accumulationLocations.gate, 1, gl.FLOAT, false, 12, 8);

      this._displayBuffer = gl.createBuffer();
      this._displayVao = gl.createVertexArray();
      if (!this._displayBuffer || !this._displayVao) {
        throw new Error('Unable to allocate Buddhabrot display geometry.');
      }
      gl.bindVertexArray(this._displayVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._displayBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        3, -1,
        -1, 3
      ]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this._displayLocations.position);
      gl.vertexAttribPointer(this._displayLocations.position, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      const maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
      this._accumulationSize = Math.min(
        this._requestedAccumulationSize,
        maxTextureSize,
        maxRenderbufferSize
      );
      if (this._accumulationSize < 1) throw new Error('No usable accumulation texture size.');

      const colorBufferFloat = gl.getExtension('EXT_color_buffer_float');
      const floatBlend = gl.getExtension('EXT_float_blend');
      let target = null;
      if (colorBufferFloat && floatBlend) {
        target = this._createAccumulationTarget(gl.RGBA16F, gl.HALF_FLOAT);
        if (target) {
          this._floatAccumulation = true;
          this._accumulationFormat = 'RGBA16F';
        }
      }
      if (!target) {
        target = this._createAccumulationTarget(gl.RGBA8, gl.UNSIGNED_BYTE);
        this._floatAccumulation = false;
        this._accumulationFormat = 'RGBA8';
      }
      if (!target) throw new Error('Unable to create a renderable Buddhabrot accumulation target.');
      this._densityTexture = target.texture;
      this._densityFramebuffer = target.framebuffer;

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
    }

    _createAccumulationTarget(internalFormat, type) {
      const gl = this.gl;
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      if (!texture || !framebuffer) {
        if (texture) gl.deleteTexture(texture);
        if (framebuffer) gl.deleteFramebuffer(framebuffer);
        return null;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        internalFormat,
        this._accumulationSize,
        this._accumulationSize,
        0,
        gl.RGBA,
        type,
        null
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );
      const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      if (!complete) {
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        return null;
      }
      return { texture, framebuffer };
    }

    _deleteResources() {
      const gl = this.gl;
      if (!gl || gl.isContextLost()) return;
      if (this._accumulationProgram) gl.deleteProgram(this._accumulationProgram);
      if (this._displayProgram) gl.deleteProgram(this._displayProgram);
      if (this._accumulationBuffer) gl.deleteBuffer(this._accumulationBuffer);
      if (this._displayBuffer) gl.deleteBuffer(this._displayBuffer);
      if (this._accumulationVao) gl.deleteVertexArray(this._accumulationVao);
      if (this._displayVao) gl.deleteVertexArray(this._displayVao);
      if (this._densityTexture) gl.deleteTexture(this._densityTexture);
      if (this._densityFramebuffer) gl.deleteFramebuffer(this._densityFramebuffer);
      this._accumulationProgram = null;
      this._displayProgram = null;
      this._accumulationBuffer = null;
      this._displayBuffer = null;
      this._accumulationVao = null;
      this._displayVao = null;
      this._densityTexture = null;
      this._densityFramebuffer = null;
    }

    _generateBatch(iterations) {
      const batchHash = mix32(
        this._seed
        ^ Math.imul(this.batches + 1, 0x9e3779b9)
        ^ Math.imul(iterations, 0x85ebca6b)
      );
      let vertexCount = 0;
      let candidateCount = 0;
      let escapedCount = 0;

      while (vertexCount < TARGET_BATCH_VERTICES && candidateCount < MAX_BATCH_CANDIDATES) {
        const candidateNumber = candidateCount + 1;
        const hashX = mix32(batchHash ^ Math.imul(candidateNumber, 0x27d4eb2d));
        const hashY = mix32(hashX ^ 0x68bc21eb);
        const hashGate = mix32(hashY ^ 0x02e5be93);
        const cx = SAMPLE_MIN_X + hashUnit(hashX) * SAMPLE_SPAN_X;
        const cy = SAMPLE_MIN_Y + hashUnit(hashY) * SAMPLE_SPAN_Y;
        candidateCount += 1;

        if (isAnalyticInterior(cx, cy)) continue;

        let zx = 0;
        let zy = 0;
        let orbitLength = 0;
        let escaped = false;
        for (let iteration = 0; iteration < iterations; iteration += 1) {
          const nextX = zx * zx - zy * zy + cx;
          zy = 2 * zx * zy + cy;
          zx = nextX;
          this._orbitXScratch[orbitLength] = zx;
          this._orbitYScratch[orbitLength] = zy;
          orbitLength += 1;
          if (zx * zx + zy * zy > 4) {
            escaped = true;
            break;
          }
        }
        if (!escaped) continue;

        escapedCount += 1;
        const gate = hashUnit(hashGate);
        const writable = Math.min(orbitLength, MAX_BATCH_VERTICES - vertexCount);
        for (let point = 0; point < writable; point += 1) {
          const offset = vertexCount * 3;
          this._vertexScratch[offset] = this._orbitXScratch[point];
          this._vertexScratch[offset + 1] = this._orbitYScratch[point];
          this._vertexScratch[offset + 2] = gate;
          vertexCount += 1;
        }
      }

      this._lastBatchHash = batchHash >>> 0;
      return { vertexCount, candidateCount, escapedCount };
    }

    _accumulate(iterations) {
      const gl = this.gl;
      const batch = this._generateBatch(iterations);
      this.samples += batch.candidateCount;
      this.escapedSamples += batch.escapedCount;
      this.orbitPoints += batch.vertexCount;
      this.batches += 1;
      if (!batch.vertexCount) return;

      gl.bindFramebuffer(gl.FRAMEBUFFER, this._densityFramebuffer);
      gl.viewport(0, 0, this._accumulationSize, this._accumulationSize);
      gl.useProgram(this._accumulationProgram);
      gl.bindVertexArray(this._accumulationVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._accumulationBuffer);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        this._vertexScratch.subarray(0, batch.vertexCount * 3)
      );
      gl.uniform2f(
        this._accumulationLocations.planeCenter,
        ORBIT_PLANE_CENTER_X,
        ORBIT_PLANE_CENTER_Y
      );
      gl.uniform1f(this._accumulationLocations.planeHalfSpan, ORBIT_PLANE_HALF_SPAN);
      gl.uniform1i(this._accumulationLocations.floatAccumulation, this._floatAccumulation ? 1 : 0);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArrays(gl.POINTS, 0, batch.vertexCount);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    _display(view, aspect, width, height) {
      const gl = this.gl;
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.disable(gl.BLEND);
      gl.clearColor(0.0025, 0.004, 0.012, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this._displayProgram);
      gl.bindVertexArray(this._displayVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._densityTexture);
      gl.uniform1i(this._displayLocations.density, 0);
      gl.uniform2f(this._displayLocations.viewCenter, view.x, view.y);
      gl.uniform1f(this._displayLocations.viewScale, view.scale);
      gl.uniform1f(this._displayLocations.aspect, aspect);
      gl.uniform2f(
        this._displayLocations.planeCenter,
        ORBIT_PLANE_CENTER_X,
        ORBIT_PLANE_CENTER_Y
      );
      gl.uniform1f(this._displayLocations.planeHalfSpan, ORBIT_PLANE_HALF_SPAN);
      gl.uniform1i(this._displayLocations.floatAccumulation, this._floatAccumulation ? 1 : 0);
      gl.uniform1f(this._displayLocations.samples, Math.max(1, this.samples));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    render(
      view = { x: -0.5, y: 0, scale: 3 },
      aspect = 1,
      width = this.canvas?.width || 1,
      height = this.canvas?.height || 1,
      iterations = DEFAULT_ITERATIONS,
      options = {}
    ) {
      if (!this.supported || this._destroyed) return this.status();
      const gl = this.gl;
      if (!gl || gl.isContextLost()) {
        this.supported = false;
        this.error = 'WebGL2 context is unavailable.';
        return this.status();
      }

      const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      const safeWidth = clamp(Math.round(finiteOr(Number(width), 1)), 1, maxViewport[0]);
      const safeHeight = clamp(Math.round(finiteOr(Number(height), 1)), 1, maxViewport[1]);
      const safeAspect = Math.max(
        1e-6,
        finiteOr(Number(aspect), safeWidth / Math.max(1, safeHeight))
      );
      const safeView = {
        x: finiteOr(Number(view?.x), -0.5),
        y: finiteOr(Number(view?.y), 0),
        scale: Math.max(1e-9, finiteOr(Number(view?.scale), 3))
      };
      const safeIterations = clamp(
        Math.round(finiteOr(Number(iterations), DEFAULT_ITERATIONS)),
        1,
        MAX_ITERATIONS
      );
      const accumulate = options?.accumulate !== false;

      try {
        if (this._iterations !== safeIterations) {
          this._iterations = safeIterations;
          this.reset();
        }
        if (accumulate) this._accumulate(safeIterations);
        this._display(safeView, safeAspect, safeWidth, safeHeight);
        this.error = null;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        this.supported = false;
      }
      return this.status();
    }

    reset() {
      this.samples = 0;
      this.escapedSamples = 0;
      this.orbitPoints = 0;
      this.batches = 0;
      this._lastBatchHash = null;
      if (!this.gl || !this._densityFramebuffer || this.gl.isContextLost()) return this.status();
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._densityFramebuffer);
      gl.viewport(0, 0, this._accumulationSize, this._accumulationSize);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return this.status();
    }

    destroy() {
      if (this._destroyed) return;
      this.canvas?.removeEventListener?.('webglcontextlost', this._onContextLost, false);
      this.canvas?.removeEventListener?.('webglcontextrestored', this._onContextRestored, false);
      this._deleteResources();
      this._destroyed = true;
      this.supported = false;
      this.error = 'BuddhabrotRenderer has been destroyed.';
    }

    status() {
      return {
        supported: this.supported,
        error: this.error,
        samples: this.samples,
        escapedSamples: this.escapedSamples,
        orbitPoints: this.orbitPoints,
        batches: this.batches,
        iterations: this._iterations,
        maxIterations: MAX_ITERATIONS,
        accumulationFormat: this._accumulationFormat,
        floatAccumulation: this._floatAccumulation,
        accumulationSize: this._accumulationSize,
        batchVertexTarget: TARGET_BATCH_VERTICES,
        lastBatchHash: this._lastBatchHash === null
          ? null
          : this._lastBatchHash.toString(16).padStart(8, '0').toUpperCase(),
        plane: {
          x: ORBIT_PLANE_CENTER_X,
          y: ORBIT_PLANE_CENTER_Y,
          scale: ORBIT_PLANE_HALF_SPAN * 2
        },
        destroyed: this._destroyed
      };
    }
  }

  Object.defineProperty(BuddhabrotRenderer, 'MAX_ITERATIONS', {
    value: MAX_ITERATIONS,
    enumerable: true
  });

  root.BuddhabrotRenderer = BuddhabrotRenderer;
}(typeof window !== 'undefined' ? window : globalThis));
