import * as THREE from "https://esm.sh/three@0.161.0";

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vPos;

  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float time;
  uniform vec3 color1;
  uniform vec3 color2;
  uniform vec3 color3;
  uniform float noiseScale;
  uniform float distortion;

  varying vec2 vUv;
  varying vec3 vPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  void main() {
    float height = clamp(vUv.y, 0.0, 1.0);
    vec2 swirl = vec2(vUv.x * 3.0, vUv.y * 4.0 + time * 1.8);
    float n = noise(swirl * noiseScale + vec2(time * 0.4, -time * 0.7));
    float flicker = smoothstep(0.2, 1.0, n + height * 0.4);
    float shape = smoothstep(0.0, 0.6, height) * (1.0 - smoothstep(0.75, 1.0, height));
    float edge = smoothstep(0.8, 0.4, abs(vUv.x - 0.5) + n * distortion);

    vec3 baseColor = mix(color3, color2, height);
    baseColor = mix(baseColor, color1, pow(height, 1.4));
    float alpha = flicker * shape * edge;
    gl_FragColor = vec4(baseColor, alpha);
  }
`;

export class Fire extends THREE.Mesh {
  constructor(geometry, options = {}) {
    const uniforms = {
      time: { value: 0 },
      color1: { value: options.color1 ?? new THREE.Color(1.0, 0.75, 0.4) },
      color2: { value: options.color2 ?? new THREE.Color(1.0, 0.4, 0.1) },
      color3: { value: options.color3 ?? new THREE.Color(0.2, 0.05, 0.02) },
      noiseScale: { value: options.noiseScale ?? 1.8 },
      distortion: { value: options.distortion ?? 0.25 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    super(geometry, material);
    this.uniforms = uniforms;
    this.speed = options.speed ?? 1.0;
  }

  update(elapsed) {
    this.uniforms.time.value = elapsed * this.speed;
  }
}
