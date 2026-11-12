import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const dataChunkCount = 6;
const dataAssetPath = "Build/WebGL-Release.data.unityweb";

async function readUnityData() {
  const chunks = await Promise.all(
    Array.from({ length: dataChunkCount }, (_, index) =>
      readFile(
        path.join(
          projectRoot,
          "Build",
          `WebGL-Release.data${String(index).padStart(2, "0")}`,
        ),
      ),
    ),
  );
  return Buffer.concat(chunks);
}

async function emitDirectory(bundle, relativeDirectory) {
  const absoluteDirectory = path.join(projectRoot, relativeDirectory);
  for (const entry of await readdir(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      await emitDirectory(bundle, relativePath);
      continue;
    }

    // The individual pieces are only an upload workaround; Unity requests
    // the original, concatenated data file at runtime.
    if (/^WebGL-Release\.data\d{2}$/.test(entry.name)) continue;
    bundle.emitFile({
      type: "asset",
      fileName: relativePath,
      source: await readFile(path.join(projectRoot, relativePath)),
    });
  }
}

function unityDataAssetPlugin() {
  return {
    name: "serve-concatenated-unity-data",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        let pathname;
        try {
          pathname = new URL(request.url, "http://localhost").pathname;
        } catch {
          return next();
        }

        if (!pathname.endsWith(`/${dataAssetPath}`) && pathname !== `/${dataAssetPath}`) {
          return next();
        }
        if (request.method !== "GET" && request.method !== "HEAD") return next();

        try {
          const data = await readUnityData();
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/octet-stream");
          response.setHeader("Content-Length", data.length);
          response.setHeader("Cache-Control", "no-cache");
          response.end(request.method === "HEAD" ? undefined : data);
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle() {
      await emitDirectory(this, "Build");
      await emitDirectory(this, "StreamingAssets");
      await emitDirectory(this, "TemplateData");
      this.emitFile({
        type: "asset",
        fileName: dataAssetPath,
        source: await readUnityData(),
      });
    },
  };
}

export default {
  plugins: [unityDataAssetPlugin()],
};
