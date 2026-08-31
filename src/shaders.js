(function registerCosmosShaders(root) {
  'use strict';

  const vertex100 = `
    precision highp float;
    attribute vec3 aPosition;
    attribute vec2 aTexCoord;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    varying vec2 vTexCoord;

    void main() {
      vTexCoord = aTexCoord;
      gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
    }
  `;

  const vertex300 = `#version 300 es
    precision highp float;
    in vec3 aPosition;
    in vec2 aTexCoord;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    out vec2 vTexCoord;

    void main() {
      vTexCoord = aTexCoord;
      gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
    }
  `;

  function wrapFragment(body, webgl2) {
    if (webgl2) {
      return `#version 300 es
        precision highp float;
        precision highp int;
        in vec2 vTexCoord;
        out vec4 fragmentColor;
        ${body.replaceAll('OUTPUT_COLOR', 'fragmentColor')}
      `;
    }
    return `
      precision highp float;
      precision highp int;
      varying vec2 vTexCoord;
      ${body.replaceAll('OUTPUT_COLOR', 'gl_FragColor')}
    `;
  }

  const mandelbrotBody = `
    uniform vec2 uCenter;
    uniform float uScale;
    uniform float uAspect;
    uniform float uTime;
    uniform float uAccent;
    uniform float uContrast;
    uniform int uIterations;

    vec3 spectrum(float t, float accent) {
      vec3 phase = vec3(0.02, 0.28, 0.56) + accent;
      return 0.48 + 0.52 * cos(6.2831853 * (vec3(t * 0.72) + phase));
    }

    float gridLine(float value, float width) {
      float derivative = max(fwidth(value), 0.00002);
      return 1.0 - smoothstep(width * derivative, (width + 1.2) * derivative, abs(fract(value) - 0.5));
    }

    void main() {
      vec2 uv = vec2(vTexCoord.x, 1.0 - vTexCoord.y);
      vec2 c = uCenter + (uv - 0.5) * vec2(uScale * uAspect, uScale);
      vec2 z = vec2(0.0);
      float trap = 12.0;
      float escapedAt = 0.0;
      bool escaped = false;

      for (int i = 0; i < 260; i++) {
        if (i >= uIterations) break;
        float x = z.x * z.x - z.y * z.y + c.x;
        float y = 2.0 * z.x * z.y + c.y;
        z = vec2(x, y);
        trap = min(trap, min(abs(length(z) - 0.5), min(abs(z.x), abs(z.y))));
        if (dot(z, z) > 256.0) {
          escapedAt = float(i) + 1.0 - log2(max(0.00001, log2(max(2.0, length(z)))));
          escaped = true;
          break;
        }
      }

      vec3 abyss = vec3(0.009, 0.012, 0.026);
      vec3 color = abyss;
      if (escaped) {
        float n = escapedAt / float(uIterations);
        float bands = 0.5 + 0.5 * cos(escapedAt * 0.46 - uTime * 0.16);
        float edge = exp(-n * 8.5) + pow(clamp(n * 1.85, 0.0, 1.0), 2.5);
        color = spectrum(n * 2.15 + trap * 0.31 + bands * 0.025, uAccent);
        color *= 0.14 + edge * 1.28;
        color += vec3(0.18, 0.58, 0.7) * exp(-trap * 58.0) * 0.55;
      } else {
        float inner = 0.015 + 0.018 * sin(c.x * 42.0 + c.y * 31.0 + uTime * 0.1);
        color += vec3(0.02, 0.03, 0.065) * inner;
      }

      float decade = pow(10.0, floor(log(max(uScale, 0.0000001)) / log(10.0)));
      float grid = max(gridLine(c.x / decade, 0.46), gridLine(c.y / decade, 0.46));
      color += vec3(0.12, 0.28, 0.38) * grid * 0.12;
      float vignette = 1.0 - smoothstep(0.38, 0.78, length(uv - 0.5));
      color *= 0.58 + 0.42 * vignette;
      color = pow(max(color * uContrast, 0.0), vec3(0.88));
      OUTPUT_COLOR = vec4(color, 1.0);
    }
  `;

  const cosmosBody = `
    uniform float uTime;
    uniform float uAge;
    uniform float uAspect;
    uniform vec2 uViewCenter;
    uniform float uViewScale;
    uniform float uViewZoom;
    uniform float uPixelWorld;
    uniform vec4 uSeed;
    uniform vec4 uSharedSeed;
    uniform vec4 uReciprocalSeed;
    uniform float uCorrelation;
    uniform float uGoldenRule;
    uniform float uGoldenCompare;
    uniform float uGoldenDivider;
    uniform float uGoldenPhase;
    uniform float uDensity;
    uniform float uTurbulence;
    uniform float uSpin;
    uniform float uVoidBias;
    uniform float uFilamentGain;
    uniform float uDarkMatter;
    uniform float uBubbleLayer;
    uniform float uGasLayer;
    uniform float uHaloLayer;
    uniform float uAttractorLayer;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    vec2 hash22(vec2 p) {
      float n = hash21(p);
      return vec2(n, hash21(p + n + 19.19));
    }

    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
      float sum = 0.0;
      float amplitude = 0.52;
      mat2 rotateScale = mat2(1.53, 1.17, -1.17, 1.53);
      for (int i = 0; i < 6; i++) {
        vec2 footprint = fwidth(p);
        float octaveGate = 1.0 - smoothstep(0.32, 0.82, max(footprint.x, footprint.y));
        sum += amplitude * mix(0.5, valueNoise(p), octaveGate);
        p = rotateScale * p + 17.13;
        amplitude *= 0.5;
      }
      return sum;
    }

    float seedField(vec2 p, vec4 seed) {
      vec2 offset = vec2(seed.x * 31.7 + seed.z * 9.2, seed.y * 27.1 + seed.w * 13.6);
      return fbm(p + offset);
    }

    float voronoiEdge(vec2 p, vec4 seed) {
      vec2 cell = floor(p);
      vec2 local = fract(p);
      float first = 10.0;
      float second = 10.0;
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 neighbor = vec2(float(x), float(y));
          vec2 point = hash22(cell + neighbor + seed.xy * 41.0);
          float d = length(neighbor + point - local);
          if (d < first) {
            second = first;
            first = d;
          } else if (d < second) {
            second = d;
          }
        }
      }
      return second - first;
    }

    mat2 rotate2d(float angle) {
      float c = cos(angle);
      float s = sin(angle);
      return mat2(c, -s, s, c);
    }

    float frequencyGate(float frequency) {
      return 1.0 - smoothstep(0.32, 0.82, frequency * uPixelWorld);
    }

    float pointKernel(vec2 local, float innerRadius, float outerRadius, float frequency) {
      float antialias = clamp(frequency * uPixelWorld * 0.5, 0.006, 0.3);
      return 1.0 - smoothstep(
        max(0.0, innerRadius - antialias),
        min(0.5, outerRadius + antialias),
        length(local - 0.5)
      );
    }

    void main() {
      vec2 screenUv = vec2(vTexCoord.x, 1.0 - vTexCoord.y);
      vec2 screenP = (uViewCenter - 0.5) + (screenUv - 0.5) * vec2(uViewScale * uAspect, uViewScale);
      vec2 p = screenP;
      vec2 uv = p + 0.5;
      float goldenSignal = max(uGoldenRule, uGoldenCompare);
      float comparisonFeather = max(0.0015, fwidth(screenUv.x) * 1.5);
      float comparisonSide = smoothstep(
        uGoldenDivider - comparisonFeather,
        uGoldenDivider + comparisonFeather,
        screenUv.x
      ) * smoothstep(0.02, 0.72, uGoldenCompare);
      vec4 visibleSeed = mix(uSeed, uReciprocalSeed, comparisonSide);
      float growth = smoothstep(0.02, 0.88, uAge);
      float dawn = smoothstep(0.18, 0.72, uAge);
      float detailOctave = clamp(log(max(uViewZoom, 1.0)) / log(2.0), 0.0, 7.0);

      float angularFlow = uSpin * (0.18 + length(p) * 0.48) * growth;
      p = rotate2d(angularFlow) * p;
      vec2 warp = vec2(
        seedField(p * (1.4 + uTurbulence), visibleSeed),
        seedField(p * (1.4 + uTurbulence) + 37.2, visibleSeed.wzyx)
      ) - 0.5;
      p += warp * (0.08 + uTurbulence * 0.22) * growth;

      float localLarge = seedField(p * 2.15, uSeed);
      float sharedLarge = seedField(p * 2.15, uSharedSeed);
      float reciprocalLarge = localLarge;
      if (goldenSignal > 0.001) {
        reciprocalLarge = seedField(rotate2d(2.39996323) * (-p) * 2.15, uReciprocalSeed.wzyx);
      }
      float largeScale = mix(mix(localLarge, sharedLarge, uCorrelation * 0.82), reciprocalLarge, comparisonSide);
      float localSmall = seedField(p * (5.2 + uTurbulence * 4.3), uSeed.zwxy);
      float reciprocalSmall = localSmall;
      if (goldenSignal > 0.001) {
        reciprocalSmall = seedField(
          rotate2d(-2.39996323) * p * (5.2 + uTurbulence * 4.3),
          uReciprocalSeed.yxwz
        );
      }
      float smallScale = mix(localSmall, reciprocalSmall, comparisonSide);
      if (uGoldenRule > 0.001) {
        float mutualField = clamp((localLarge + reciprocalLarge) * 0.5
          + (1.0 - abs(localLarge - reciprocalLarge)) * 0.14, 0.0, 1.0);
        largeScale = mix(largeScale, mutualField, uGoldenRule * 0.72);
        smallScale = mix(smallScale, reciprocalSmall, uGoldenRule * 0.42);
      }
      float ridge = 1.0 - abs(2.0 * (largeScale * 0.68 + smallScale * 0.32) - 1.0);
      ridge = pow(clamp(ridge, 0.0, 1.0), 3.2 - uFilamentGain * 0.8);
      float cellular = 1.0 - smoothstep(0.025, 0.24, voronoiEdge(p * (5.0 + uDensity * 3.0), visibleSeed));
      float filaments = clamp(ridge * 0.72 + cellular * 0.62, 0.0, 1.0) * growth;

      float subReveal = smoothstep(1.7, 7.0, uViewZoom);
      float microA = seedField(p * (15.0 + uTurbulence * 7.0), visibleSeed.yxwz);
      float microB = seedField(p * (31.0 + uDensity * 13.0) + 81.7, visibleSeed.wxyz);
      float microRidge = 1.0 - abs(2.0 * (microA * 0.68 + microB * 0.32) - 1.0);
      microRidge = pow(clamp(microRidge, 0.0, 1.0), 4.2);
      float microCell = 1.0 - smoothstep(0.018, 0.18, voronoiEdge(p * (16.0 + uDensity * 8.0), visibleSeed.zwxy));
      float subFilaments = clamp(microRidge * 0.74 + microCell * 0.48, 0.0, 1.0)
        * subReveal * growth * frequencyGate((31.0 + uDensity * 13.0) * 26.0);

      float nanoReveal = smoothstep(11.0, 42.0, uViewZoom);
      float nanoA = seedField(p * (72.0 + uTurbulence * 29.0), visibleSeed.wzyx);
      float nanoB = seedField(p * (154.0 + uDensity * 51.0) + 137.0, visibleSeed.zxyw);
      float nanoRidge = pow(clamp(1.0 - abs(nanoA - nanoB), 0.0, 1.0), 7.2)
        * nanoReveal * growth * frequencyGate((154.0 + uDensity * 51.0) * 26.0);
      filaments = clamp(filaments + subFilaments * 0.56 + nanoRidge * 0.32, 0.0, 1.0);

      float bubbleShells = 0.0;
      float potential = 0.0;
      for (int i = 0; i < 7; i++) {
        float fi = float(i);
        vec2 center = hash22(vec2(fi * 7.17, fi * 19.3) + visibleSeed.xy * 53.0) - 0.5;
        float radius = 0.07 + hash21(center + fi) * 0.22 + uAge * (0.015 + 0.04 * hash21(center));
        float d = length(p - center);
        bubbleShells += exp(-abs(d - radius) * (42.0 - uVoidBias * 13.0));
        potential += exp(-d * d / max(0.006, radius * radius)) * (0.12 + uDensity * 0.16);
      }
      bubbleShells = clamp(bubbleShells, 0.0, 1.0) * uBubbleLayer * growth;

      float voidMask = smoothstep(0.18 + uVoidBias * 0.2, 0.78, largeScale + potential * 0.2);
      float halo = pow(clamp(filaments * (0.55 + potential), 0.0, 1.0), 3.6) * uHaloLayer;
      float gas = pow(clamp(filaments * smallScale, 0.0, 1.0), 2.2) * uGasLayer * dawn;

      vec3 color = vec3(0.006, 0.008, 0.021);
      color += vec3(0.025, 0.07, 0.18) * largeScale * (0.45 + uDarkMatter * 0.11);
      color += vec3(0.08, 0.28, 0.52) * filaments * (0.4 + uDarkMatter * 0.12);
      color += vec3(0.28, 0.16, 0.66) * bubbleShells * 0.55;
      color += vec3(0.04, 0.56, 0.62) * gas * 0.6;
      color += vec3(0.85, 0.33, 0.58) * gas * gas * 0.28;
      color += mix(vec3(0.35, 0.72, 0.95), vec3(0.98, 0.58, 0.18), clamp(halo * 1.3, 0.0, 1.0)) * halo * 0.72;
      color += vec3(0.07, 0.42, 0.58) * subFilaments * (0.08 + detailOctave * 0.032);
      color += vec3(0.88, 0.54, 0.22) * nanoRidge * 0.19;
      color *= 0.44 + voidMask * 0.78;

      float dustGrid = 420.0;
      vec2 dustCell = floor(uv * dustGrid);
      float dust = hash21(dustCell + visibleSeed.xy * 103.0);
      float dustShape = pointKernel(fract(uv * dustGrid), 0.0, 0.08, dustGrid);
      float starThreshold = 0.996 - uDensity * 0.0015;
      float stars = step(starThreshold, dust) * dustShape * dawn * frequencyGate(dustGrid)
        * smoothstep(0.34, 0.78, filaments + halo);
      color += vec3(1.0, 0.86, 0.64) * stars * (0.8 + 1.5 * hash21(dustCell + 9.1));

      float clusterReveal = smoothstep(5.0, 11.0, uViewZoom);
      float clusterGrid = 2400.0;
      vec2 clusterCell = floor(uv * clusterGrid);
      float clusterHash = hash21(clusterCell + visibleSeed.zw * 619.0);
      float clusterShape = pointKernel(fract(uv * clusterGrid), 0.035, 0.21, clusterGrid);
      float clusterStars = step(0.993, clusterHash) * clusterShape * clusterReveal * dawn * frequencyGate(clusterGrid)
        * smoothstep(0.22, 0.7, subFilaments + filaments * 0.48);
      color += mix(vec3(0.42, 0.76, 1.0), vec3(1.0, 0.66, 0.34), hash21(clusterCell + 17.0))
        * clusterStars * (1.2 + 2.1 * hash21(clusterCell + 53.0));

      float stellarReveal = smoothstep(19.0, 45.0, uViewZoom);
      float stellarGrid = 12000.0;
      vec2 stellarCell = floor(uv * stellarGrid);
      float stellarHash = hash21(stellarCell + visibleSeed.xy * 1301.0);
      float stellarShape = pointKernel(fract(uv * stellarGrid), 0.025, 0.17, stellarGrid);
      float resolvedStars = step(0.9945, stellarHash) * stellarShape * stellarReveal * dawn * frequencyGate(stellarGrid)
        * smoothstep(0.28, 0.78, nanoRidge + subFilaments * 0.6);
      color += mix(vec3(0.56, 0.78, 1.0), vec3(1.0, 0.78, 0.5), hash21(stellarCell + 31.0))
        * resolvedStars * (1.6 + 2.8 * hash21(stellarCell + 101.0));

      if (uGoldenCompare > 0.001) {
        float reciprocalDifference = abs(localLarge - reciprocalLarge);
        vec3 comparisonTint = mix(vec3(0.34, 0.72, 0.95), vec3(1.0, 0.67, 0.24), comparisonSide);
        color = mix(color, color * comparisonTint * 1.28, uGoldenCompare * 0.18);
        color += comparisonTint * reciprocalDifference * uGoldenCompare * 0.16;
        float dividerGlow = exp(
          -abs(screenUv.x - uGoldenDivider) / max(0.0018, comparisonFeather * 1.8)
        );
        color += vec3(1.0, 0.86, 0.46) * dividerGlow * uGoldenCompare * 0.72;
      }

      if (uGoldenRule > 0.001) {
        vec2 portal = screenUv - 0.5;
        portal.x *= uAspect;
        float portalRadius = max(0.0001, length(portal));
        float portalAngle = atan(portal.y, portal.x);
        float spiralCarrier = 0.5 + 0.5 * cos(
          portalAngle * 5.0 - log(portalRadius) * 7.4 + uGoldenPhase * 0.34
        );
        float spiral = pow(spiralCarrier, 24.0)
          * smoothstep(0.018, 0.055, portalRadius)
          * (1.0 - smoothstep(0.12, 0.54, portalRadius));
        float phiBloom = 0.0;
        for (int i = 0; i < 34; i++) {
          float fi = (float(i) + 0.5) / 34.0;
          float nodeAngle = float(i) * 2.39996323 + uGoldenPhase * 0.075;
          float nodeRadius = sqrt(fi) * 0.43;
          vec2 node = vec2(cos(nodeAngle), sin(nodeAngle)) * nodeRadius;
          float nodeSize = mix(0.0048, 0.0022, fi);
          float nodeDistance = length(portal - node);
          phiBloom += exp(-(nodeDistance * nodeDistance) / (nodeSize * nodeSize));
        }
        float reciprocalAgreement = pow(clamp(1.0 - abs(localLarge - reciprocalLarge), 0.0, 1.0), 5.0);
        float breathingRing = exp(-abs(portalRadius - (0.19 + sin(uGoldenPhase / 1.618) * 0.025)) * 92.0);
        float iris = 1.0 - smoothstep(0.0, 0.055, portalRadius);
        vec3 reciprocalGold = mix(vec3(0.72, 0.31, 0.055), vec3(1.0, 0.91, 0.48), reciprocalAgreement);
        color = mix(color, color * vec3(1.2, 0.96, 0.72) + reciprocalGold * reciprocalAgreement * 0.13,
          uGoldenRule * 0.34);
        color += reciprocalGold * (spiral * 0.46 + min(phiBloom, 2.4) * 0.34
          + breathingRing * 0.16 + iris * 0.22) * uGoldenRule;
      }

      float attractorGhost = abs(sin((p.x * 11.0 + p.y * 15.0 + largeScale * 6.0) - uTime * 0.12));
      attractorGhost = pow(1.0 - attractorGhost, 18.0) * uAttractorLayer * 0.08;
      color += vec3(0.76, 0.3, 0.78) * attractorGhost;

      float vignette = 1.0 - smoothstep(0.34, 0.8, length(screenUv - 0.5));
      color *= 0.62 + vignette * 0.38;
      float microscopeExposure = mix(1.0, 0.22, smoothstep(1.2, 6.0, uViewZoom));
      color *= microscopeExposure;
      color = color / (1.0 + color * 0.65);
      color = pow(max(color, 0.0), vec3(0.86));
      OUTPUT_COLOR = vec4(color, 1.0);
    }
  `;

  root.CosmosShaders = Object.freeze({
    vertex: (webgl2) => (webgl2 ? vertex300 : vertex100),
    mandelbrot: (webgl2) => wrapFragment(mandelbrotBody, webgl2),
    cosmos: (webgl2) => wrapFragment(cosmosBody, webgl2)
  });
}(window));
