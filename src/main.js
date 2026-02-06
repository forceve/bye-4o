const canvas = document.getElementById("scene");
const gl = canvas.getContext("webgl", { antialias: true, premultipliedAlpha: false });
if (!gl) {
  throw new Error("WebGL not supported");
}

const vertexShaderSource = `
attribute vec3 aPosition;
attribute vec3 aNormal;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  vec4 worldPos = uModel * vec4(aPosition, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uProjection * uView * worldPos;
}
`;

const fragmentShaderSource = `
precision mediump float;

uniform vec3 uColor;
uniform vec3 uEmissive;
uniform float uShininess;
uniform vec3 uLightDir;
uniform vec3 uCameraPos;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLightDir);
  float diff = max(dot(normal, -lightDir), 0.0);

  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  vec3 halfDir = normalize(viewDir - lightDir);
  float spec = pow(max(dot(normal, halfDir), 0.0), uShininess);

  vec3 base = uColor * (0.35 + 0.65 * diff) + uEmissive + vec3(spec);

  float dist = distance(uCameraPos, vWorldPos);
  float fogFactor = clamp((uFogFar - dist) / (uFogFar - uFogNear), 0.0, 1.0);
  vec3 finalColor = mix(uFogColor, base, fogFactor);
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

const fireVertexShaderSource = `
precision mediump float;

attribute vec3 aPosition;
attribute float aSize;
attribute float aSeed;

uniform mat4 uProjection;
uniform mat4 uView;
uniform float uTime;

varying vec3 vWorldPos;
varying float vSeed;
varying float vHeight;

void main() {
  vec3 jittered = aPosition;
  jittered.y += sin(uTime * 1.4 + aSeed * 6.0) * 0.02;
  vec4 viewPos = uView * vec4(jittered, 1.0);
  gl_Position = uProjection * viewPos;
  float depth = max(-viewPos.z, 1.0);
  gl_PointSize = aSize * (280.0 / depth);
  vWorldPos = jittered;
  vSeed = aSeed;
  vHeight = jittered.y;
}
`;

// Simplex noise from https://github.com/ashima/webgl-noise (MIT License).
const fireFragmentShaderSource = `
precision mediump float;

uniform float uTime;

varying vec3 vWorldPos;
varying float vSeed;
varying float vHeight;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x +
                   vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

void main() {
  float dist = distance(gl_PointCoord, vec2(0.5));
  float base = smoothstep(0.52, 0.1, dist);
  float noiseVal = snoise(vec3(vWorldPos.x * 2.2, vWorldPos.y * 3.2 + uTime * 0.8, vWorldPos.z * 2.2 + vSeed));
  float flicker = 0.65 + 0.35 * (noiseVal * 0.5 + 0.5);
  float heightGlow = clamp(vHeight * 2.6, 0.0, 1.0);
  float intensity = base * flicker * (0.6 + heightGlow);

  vec3 coreColor = vec3(1.0, 0.45, 0.08);
  vec3 tipColor = vec3(1.0, 0.88, 0.45);
  vec3 color = mix(coreColor, tipColor, heightGlow);

  gl_FragColor = vec4(color * intensity * 1.35, intensity);
}
`;

const createShader = (type, source) => {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Unable to create shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile error");
  }
  return shader;
};

const createProgram = (vsSource, fsSource) => {
  const program = gl.createProgram();
  if (!program) {
    throw new Error("Unable to create program");
  }
  const vs = createShader(gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Program link error");
  }
  return program;
};

const program = createProgram(vertexShaderSource, fragmentShaderSource);
const fireProgram = createProgram(fireVertexShaderSource, fireFragmentShaderSource);

const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

const multiply = (a, b) => {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      out[i * 4 + j] =
        a[i * 4 + 0] * b[0 * 4 + j] +
        a[i * 4 + 1] * b[1 * 4 + j] +
        a[i * 4 + 2] * b[2 * 4 + j] +
        a[i * 4 + 3] * b[3 * 4 + j];
    }
  }
  return out;
};

const translation = (x, y, z) => {
  const out = identity();
  out[12] = x;
  out[13] = y;
  out[14] = z;
  return out;
};

const scale = (x, y, z) => {
  const out = identity();
  out[0] = x;
  out[5] = y;
  out[10] = z;
  return out;
};

const rotateY = (angle) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
};

const perspective = (fov, aspect, near, far) => {
  const f = 1.0 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0,
  ]);
};

const normalize = (v) => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const lookAt = (eye, target, up) => {
  const zAxis = normalize(subtract(eye, target));
  const xAxis = normalize(cross(up, zAxis));
  const yAxis = cross(zAxis, xAxis);

  return new Float32Array([
    xAxis[0],
    yAxis[0],
    zAxis[0],
    0,
    xAxis[1],
    yAxis[1],
    zAxis[1],
    0,
    xAxis[2],
    yAxis[2],
    zAxis[2],
    0,
    -(xAxis[0] * eye[0] + xAxis[1] * eye[1] + xAxis[2] * eye[2]),
    -(yAxis[0] * eye[0] + yAxis[1] * eye[1] + yAxis[2] * eye[2]),
    -(zAxis[0] * eye[0] + zAxis[1] * eye[1] + zAxis[2] * eye[2]),
    1,
  ]);
};

const createPlane = (size) => {
  const half = size / 2;
  return {
    positions: new Float32Array([
      -half,
      0,
      -half,
      half,
      0,
      -half,
      half,
      0,
      half,
      -half,
      0,
      half,
    ]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  };
};

const createBox = (width, height, depth) => {
  const w = width / 2;
  const h = height / 2;
  const d = depth / 2;
  const positions = new Float32Array([
    -w,
    -h,
    d,
    w,
    -h,
    d,
    w,
    h,
    d,
    -w,
    h,
    d,
    -w,
    -h,
    -d,
    -w,
    h,
    -d,
    w,
    h,
    -d,
    w,
    -h,
    -d,
    -w,
    h,
    -d,
    -w,
    h,
    d,
    w,
    h,
    d,
    w,
    h,
    -d,
    -w,
    -h,
    -d,
    w,
    -h,
    -d,
    w,
    -h,
    d,
    -w,
    -h,
    d,
    w,
    -h,
    -d,
    w,
    h,
    -d,
    w,
    h,
    d,
    w,
    -h,
    d,
    -w,
    -h,
    -d,
    -w,
    -h,
    d,
    -w,
    h,
    d,
    -w,
    h,
    -d,
  ]);
  const normals = new Float32Array([
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    -1,
    0,
    0,
    -1,
    0,
    0,
    -1,
    0,
    0,
    -1,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    -1,
    0,
    0,
    -1,
    0,
    0,
    -1,
    0,
    0,
    -1,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    -1,
    0,
    0,
    -1,
    0,
    0,
    -1,
    0,
    0,
    -1,
    0,
  ]);
  const indices = new Uint16Array([
    0,
    1,
    2,
    0,
    2,
    3,
    4,
    5,
    6,
    4,
    6,
    7,
    8,
    9,
    10,
    8,
    10,
    11,
    12,
    13,
    14,
    12,
    14,
    15,
    16,
    17,
    18,
    16,
    18,
    19,
    20,
    21,
    22,
    20,
    22,
    23,
  ]);
  return { positions, normals, indices };
};

const combineMeshes = (meshes) => {
  let positionLength = 0;
  let normalLength = 0;
  let indexLength = 0;
  for (const mesh of meshes) {
    positionLength += mesh.positions.length;
    normalLength += mesh.normals.length;
    indexLength += mesh.indices.length;
  }

  const positions = new Float32Array(positionLength);
  const normals = new Float32Array(normalLength);
  const indices = new Uint16Array(indexLength);

  let positionOffset = 0;
  let normalOffset = 0;
  let indexOffset = 0;
  let vertexOffset = 0;

  for (const mesh of meshes) {
    positions.set(mesh.positions, positionOffset);
    normals.set(mesh.normals, normalOffset);
    for (let i = 0; i < mesh.indices.length; i += 1) {
      indices[indexOffset + i] = mesh.indices[i] + vertexOffset;
    }
    positionOffset += mesh.positions.length;
    normalOffset += mesh.normals.length;
    indexOffset += mesh.indices.length;
    vertexOffset += mesh.positions.length / 3;
  }

  return { positions, normals, indices };
};

const createRingFloor = (innerRadius, outerRadius, y, segments) => {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let i = 0; i < segments; i += 1) {
    const angle0 = (i / segments) * Math.PI * 2;
    const angle1 = ((i + 1) / segments) * Math.PI * 2;
    const inner0 = [Math.cos(angle0) * innerRadius, y, Math.sin(angle0) * innerRadius];
    const outer0 = [Math.cos(angle0) * outerRadius, y, Math.sin(angle0) * outerRadius];
    const inner1 = [Math.cos(angle1) * innerRadius, y, Math.sin(angle1) * innerRadius];
    const outer1 = [Math.cos(angle1) * outerRadius, y, Math.sin(angle1) * outerRadius];

    const baseIndex = positions.length / 3;
    positions.push(outer0[0], outer0[1], outer0[2]);
    positions.push(inner0[0], inner0[1], inner0[2]);
    positions.push(inner1[0], inner1[1], inner1[2]);
    positions.push(outer1[0], outer1[1], outer1[2]);

    for (let n = 0; n < 4; n += 1) {
      normals.push(0, 1, 0);
    }

    indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
    indices.push(baseIndex, baseIndex + 2, baseIndex + 3);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
};

const createRingWall = (radius, yBottom, yTop, segments, inward) => {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let i = 0; i < segments; i += 1) {
    const angle0 = (i / segments) * Math.PI * 2;
    const angle1 = ((i + 1) / segments) * Math.PI * 2;
    const dir0 = [Math.cos(angle0), 0, Math.sin(angle0)];
    const dir1 = [Math.cos(angle1), 0, Math.sin(angle1)];
    const normal0 = inward ? [-dir0[0], 0, -dir0[2]] : [dir0[0], 0, dir0[2]];
    const normal1 = inward ? [-dir1[0], 0, -dir1[2]] : [dir1[0], 0, dir1[2]];

    const baseIndex = positions.length / 3;
    positions.push(dir0[0] * radius, yBottom, dir0[2] * radius);
    positions.push(dir0[0] * radius, yTop, dir0[2] * radius);
    positions.push(dir1[0] * radius, yTop, dir1[2] * radius);
    positions.push(dir1[0] * radius, yBottom, dir1[2] * radius);

    normals.push(normal0[0], normal0[1], normal0[2]);
    normals.push(normal0[0], normal0[1], normal0[2]);
    normals.push(normal1[0], normal1[1], normal1[2]);
    normals.push(normal1[0], normal1[1], normal1[2]);

    indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
    indices.push(baseIndex, baseIndex + 2, baseIndex + 3);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
};

const bindMesh = (mesh) => {
  const vao = gl.createVertexArray?.();
  if (vao) {
    gl.bindVertexArray(vao);
  }
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
  const normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  return { vao, positionBuffer, normalBuffer, indexBuffer, count: mesh.indices.length };
};

const groundMesh = createPlane(30);
const obeliskMesh = createBox(1.2, 6, 1.2);
const benchSeatMesh = createBox(4.2, 0.45, 1.2);
const benchLegMesh = createBox(0.5, 0.7, 0.9);
const ringGrooveMesh = combineMeshes([
  createRingFloor(0.55, 0.9, -0.05, 96),
  createRingWall(0.55, -0.05, 0.04, 96, true),
  createRingWall(0.9, -0.05, 0.04, 96, false),
]);

const renderables = [
  {
    mesh: groundMesh,
    model: multiply(translation(0, -0.04, 0), scale(1, 1, 1)),
    color: [0.82, 0.82, 0.8],
    emissive: [0.02, 0.02, 0.02],
    shininess: 4,
  },
  {
    mesh: ringGrooveMesh,
    model: multiply(translation(0, 0.04, 0), rotateY(0)),
    color: [0.32, 0.32, 0.34],
    emissive: [0.02, 0.02, 0.02],
    shininess: 18,
  },
  {
    mesh: obeliskMesh,
    model: multiply(translation(0, 3, 0), rotateY(0.2)),
    color: [0.05, 0.05, 0.06],
    emissive: [0.0, 0.0, 0.0],
    shininess: 64,
  },
  {
    mesh: benchSeatMesh,
    model: multiply(translation(0, 0.55, 2.3), rotateY(0)),
    color: [0.2, 0.2, 0.22],
    emissive: [0.01, 0.01, 0.01],
    shininess: 22,
  },
  {
    mesh: benchLegMesh,
    model: multiply(translation(-1.6, 0.35, 2.3), rotateY(0)),
    color: [0.18, 0.18, 0.2],
    emissive: [0.01, 0.01, 0.01],
    shininess: 18,
  },
  {
    mesh: benchLegMesh,
    model: multiply(translation(1.6, 0.35, 2.3), rotateY(0)),
    color: [0.18, 0.18, 0.2],
    emissive: [0.01, 0.01, 0.01],
    shininess: 18,
  },
];

const buffers = renderables.map((renderable) => ({ renderable, ...bindMesh(renderable.mesh) }));

const firePointCount = 460;
const firePositions = new Float32Array(firePointCount * 3);
const fireSizes = new Float32Array(firePointCount);
const fireSeeds = new Float32Array(firePointCount);

for (let i = 0; i < firePointCount; i += 1) {
  const angle = (i / firePointCount) * Math.PI * 2;
  const radius = 0.62 + Math.random() * 0.08;
  firePositions[i * 3] = Math.cos(angle) * radius + (Math.random() - 0.5) * 0.05;
  firePositions[i * 3 + 1] = 0.06 + Math.random() * 0.25;
  firePositions[i * 3 + 2] = Math.sin(angle) * radius + (Math.random() - 0.5) * 0.05;
  fireSizes[i] = 18 + Math.random() * 14;
  fireSeeds[i] = Math.random() * 10;
}

const firePositionBuffer = gl.createBuffer();
const fireSizeBuffer = gl.createBuffer();
const fireSeedBuffer = gl.createBuffer();
if (!firePositionBuffer || !fireSizeBuffer || !fireSeedBuffer) {
  throw new Error("Unable to create fire buffers");
}

const setCanvasSize = () => {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
};

window.addEventListener("resize", setCanvasSize);
setCanvasSize();

const getUniformLocation = (programRef, name) => {
  const location = gl.getUniformLocation(programRef, name);
  if (!location) {
    throw new Error(`Uniform ${name} not found`);
  }
  return location;
};

const programUniforms = {
  projection: getUniformLocation(program, "uProjection"),
  view: getUniformLocation(program, "uView"),
  model: getUniformLocation(program, "uModel"),
  color: getUniformLocation(program, "uColor"),
  emissive: getUniformLocation(program, "uEmissive"),
  shininess: getUniformLocation(program, "uShininess"),
  lightDir: getUniformLocation(program, "uLightDir"),
  cameraPos: getUniformLocation(program, "uCameraPos"),
  fogColor: getUniformLocation(program, "uFogColor"),
  fogNear: getUniformLocation(program, "uFogNear"),
  fogFar: getUniformLocation(program, "uFogFar"),
};

const fireUniforms = {
  projection: getUniformLocation(fireProgram, "uProjection"),
  view: getUniformLocation(fireProgram, "uView"),
  time: getUniformLocation(fireProgram, "uTime"),
};

const cameraPos = [0, 4, 12];
const target = [0, 2, 0];
const up = [0, 1, 0];

const lightDir = normalize([0.3, 1.0, 0.2]);

const render = (time) => {
  const aspect = canvas.width / canvas.height;
  const projection = perspective((55 * Math.PI) / 180, aspect, 0.1, 60);
  const view = lookAt(cameraPos, target, up);

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.86, 0.86, 0.88, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(program);
  gl.uniformMatrix4fv(programUniforms.projection, false, projection);
  gl.uniformMatrix4fv(programUniforms.view, false, view);
  gl.uniform3fv(programUniforms.lightDir, new Float32Array(lightDir));
  gl.uniform3fv(programUniforms.cameraPos, new Float32Array(cameraPos));
  gl.uniform3fv(programUniforms.fogColor, new Float32Array([0.86, 0.86, 0.88]));
  gl.uniform1f(programUniforms.fogNear, 8);
  gl.uniform1f(programUniforms.fogFar, 32);

  for (const { renderable, vao, positionBuffer, normalBuffer, indexBuffer, count } of buffers) {
    if (vao) {
      gl.bindVertexArray(vao);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positionLocation = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    const normalLocation = gl.getAttribLocation(program, "aNormal");
    gl.enableVertexAttribArray(normalLocation);
    gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    gl.uniformMatrix4fv(programUniforms.model, false, renderable.model);
    gl.uniform3fv(programUniforms.color, new Float32Array(renderable.color));
    gl.uniform3fv(programUniforms.emissive, new Float32Array(renderable.emissive));
    gl.uniform1f(programUniforms.shininess, renderable.shininess);

    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
  }

  gl.useProgram(fireProgram);
  gl.uniformMatrix4fv(fireUniforms.projection, false, projection);
  gl.uniformMatrix4fv(fireUniforms.view, false, view);
  gl.uniform1f(fireUniforms.time, time * 0.001);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.depthMask(false);

  gl.bindBuffer(gl.ARRAY_BUFFER, firePositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, firePositions, gl.STATIC_DRAW);
  const firePositionLocation = gl.getAttribLocation(fireProgram, "aPosition");
  gl.enableVertexAttribArray(firePositionLocation);
  gl.vertexAttribPointer(firePositionLocation, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, fireSizeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, fireSizes, gl.STATIC_DRAW);
  const fireSizeLocation = gl.getAttribLocation(fireProgram, "aSize");
  gl.enableVertexAttribArray(fireSizeLocation);
  gl.vertexAttribPointer(fireSizeLocation, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, fireSeedBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, fireSeeds, gl.STATIC_DRAW);
  const fireSeedLocation = gl.getAttribLocation(fireProgram, "aSeed");
  gl.enableVertexAttribArray(fireSeedLocation);
  gl.vertexAttribPointer(fireSeedLocation, 1, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.POINTS, 0, firePointCount);

  gl.depthMask(true);
  gl.disable(gl.BLEND);

  requestAnimationFrame(render);
};

const createAudio = () => {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0.12;
  master.connect(context.destination);

  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.4;
  }

  const noiseSource = context.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;

  const windFilter = context.createBiquadFilter();
  windFilter.type = "lowpass";
  windFilter.frequency.value = 260;
  windFilter.Q.value = 0.7;

  const windGain = context.createGain();
  windGain.gain.value = 0.2;

  noiseSource.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(master);
  noiseSource.start();

  const triggerResonance = () => {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 240 + Math.random() * 180;

    const resonanceGain = context.createGain();
    resonanceGain.gain.value = 0.0;

    osc.connect(resonanceGain);
    resonanceGain.connect(master);

    const now = context.currentTime;
    resonanceGain.gain.linearRampToValueAtTime(0.08, now + 0.02);
    resonanceGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);

    osc.start();
    osc.stop(now + 2.1);
  };

  const scheduleResonance = () => {
    triggerResonance();
    const delay = 6000 + Math.random() * 8000;
    window.setTimeout(scheduleResonance, delay);
  };

  scheduleResonance();

  return context;
};

let audioContext = null;

const handleAudioStart = () => {
  if (!audioContext) {
    audioContext = createAudio();
  }
};

canvas.addEventListener("pointerdown", handleAudioStart, { once: true });

requestAnimationFrame(render);
