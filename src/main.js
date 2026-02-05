const canvas = document.getElementById("scene");
const overlay = document.getElementById("overlay");
const startButton = document.getElementById("start");

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

const pointVertexShaderSource = `
attribute vec3 aPosition;
attribute float aSize;

uniform mat4 uProjection;
uniform mat4 uView;
uniform vec3 uColor;

varying vec3 vColor;

void main() {
  vec4 viewPos = uView * vec4(aPosition, 1.0);
  gl_Position = uProjection * viewPos;
  gl_PointSize = aSize;
  vColor = uColor;
}
`;

const pointFragmentShaderSource = `
precision mediump float;

varying vec3 vColor;

void main() {
  float dist = distance(gl_PointCoord, vec2(0.5));
  float alpha = smoothstep(0.5, 0.1, dist);
  gl_FragColor = vec4(vColor, alpha);
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
const pointProgram = createProgram(pointVertexShaderSource, pointFragmentShaderSource);

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

const createCirclePoints = (radius, segments, y) => {
  const data = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    data[i * 3] = Math.cos(angle) * radius;
    data[i * 3 + 1] = y;
    data[i * 3 + 2] = Math.sin(angle) * radius;
  }
  return data;
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
const benchMesh = createBox(4.6, 0.5, 1.1);

const renderables = [
  {
    mesh: groundMesh,
    model: multiply(translation(0, 0, 0), scale(1, 1, 1)),
    color: [0.82, 0.82, 0.8],
    emissive: [0.02, 0.02, 0.02],
    shininess: 4,
  },
  {
    mesh: obeliskMesh,
    model: multiply(translation(0, 3, 0), rotateY(0.2)),
    color: [0.05, 0.05, 0.06],
    emissive: [0.0, 0.0, 0.0],
    shininess: 64,
  },
  {
    mesh: benchMesh,
    model: multiply(translation(-3, 0.25, 1.2), rotateY(-0.2)),
    color: [0.68, 0.68, 0.68],
    emissive: [0.02, 0.02, 0.02],
    shininess: 10,
  },
];

const buffers = renderables.map((renderable) => ({ renderable, ...bindMesh(renderable.mesh) }));

const ringPoints = createCirclePoints(0.55, 80, 0.05);
const ringBuffer = gl.createBuffer();
if (!ringBuffer) {
  throw new Error("Unable to create ring buffer");
}

const sparkBuffer = gl.createBuffer();
if (!sparkBuffer) {
  throw new Error("Unable to create spark buffer");
}

let spark = { position: [0, 0.1, 0], life: 0 };

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

const pointUniforms = {
  projection: getUniformLocation(pointProgram, "uProjection"),
  view: getUniformLocation(pointProgram, "uView"),
  color: getUniformLocation(pointProgram, "uColor"),
};

const cameraPos = [0, 4, 12];
const target = [0, 2, 0];
const up = [0, 1, 0];

const lightDir = normalize([0.3, 1.0, 0.2]);

const render = () => {
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

  gl.useProgram(pointProgram);
  gl.uniformMatrix4fv(pointUniforms.projection, false, projection);
  gl.uniformMatrix4fv(pointUniforms.view, false, view);

  gl.bindBuffer(gl.ARRAY_BUFFER, ringBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, ringPoints, gl.STATIC_DRAW);
  const ringLocation = gl.getAttribLocation(pointProgram, "aPosition");
  gl.enableVertexAttribArray(ringLocation);
  gl.vertexAttribPointer(ringLocation, 3, gl.FLOAT, false, 0, 0);

  const sizeLocation = gl.getAttribLocation(pointProgram, "aSize");
  gl.disableVertexAttribArray(sizeLocation);
  gl.vertexAttrib1f(sizeLocation, 6.0);

  gl.uniform3fv(pointUniforms.color, new Float32Array([0.35, 0.06, 0.05]));
  gl.drawArrays(gl.POINTS, 0, ringPoints.length / 3);

  if (spark.life <= 0 && Math.random() > 0.985) {
    spark = {
      position: [(Math.random() - 0.5) * 0.3, 0.08, (Math.random() - 0.5) * 0.3],
      life: 1,
    };
  }

  if (spark.life > 0) {
    spark.life -= 0.02;
    spark.position[1] += 0.02;

    gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spark.position), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(ringLocation);
    gl.vertexAttribPointer(ringLocation, 3, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(sizeLocation);
    gl.vertexAttrib1f(sizeLocation, 10.0);
    gl.uniform3fv(pointUniforms.color, new Float32Array([0.6, 0.1, 0.05]));
    gl.drawArrays(gl.POINTS, 0, 1);
  }

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

startButton.addEventListener("click", () => {
  overlay.classList.add("hidden");
  if (!audioContext) {
    audioContext = createAudio();
  }
});

requestAnimationFrame(render);
