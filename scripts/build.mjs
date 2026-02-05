import { mkdir, rm, cp } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = new URL("..", `file://${root}/`).pathname;
const distDir = new URL("dist/", `file://${projectRoot}/`).pathname;

const ensureDir = async (path) => {
  await mkdir(path, { recursive: true });
};

const copyFile = async (source, destination) => {
  await ensureDir(dirname(destination));
  await cp(source, destination);
};

const run = async () => {
  await rm(distDir, { recursive: true, force: true });
  await ensureDir(distDir);

  await copyFile(`${projectRoot}/index.html`, `${distDir}/index.html`);
  await copyFile(`${projectRoot}/styles.css`, `${distDir}/styles.css`);
  await copyFile(`${projectRoot}/src/main.js`, `${distDir}/src/main.js`);
};

run();
