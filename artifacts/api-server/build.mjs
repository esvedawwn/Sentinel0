import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

function getArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

async function buildAll() {
  const requestedFormat = getArg("format") ?? "esm";
  const requestedOutdir  = getArg("outdir");

  // --outfile is NOT supported when esbuild-plugin-pino is active: the plugin
  // generates multiple worker entry points (pino-worker, thread-stream-worker,
  // pino-file, pino-pretty) which require outdir.  Use --outdir instead.
  const legacyOutfile = getArg("outfile");
  if (legacyOutfile) {
    console.error(
      "ERROR: --outfile is not compatible with esbuild-plugin-pino (multiple outputs).\n" +
      "       Use --outdir=<dir> instead.  Example: --outdir=dist-sea"
    );
    process.exit(1);
  }

  const isCJS = requestedFormat === "cjs";

  // Resolve output directory: explicit --outdir wins, otherwise default to dist/
  const distDir = requestedOutdir
    ? path.resolve(artifactDir, requestedOutdir)
    : path.resolve(artifactDir, "dist");

  await rm(distDir, { recursive: true, force: true });

  const buildOptions = {
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: requestedFormat,
    logLevel: "info",

    outdir: distDir,
    outExtension: {
      ".js": isCJS ? ".cjs" : ".mjs",
    },

    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      // @libsql/client and libsql are intentionally NOT external so esbuild
      // bundles their JS into index.cjs.  The dynamic platform require inside
      // libsql/index.js — require(`@libsql/${target}`) — must resolve from the
      // bundle's own directory (dist-sea/) at runtime, not from the pnpm store
      // path deep in the snapshot, so pkg can find the staged .node file.
      // The platform packages below remain external so that dynamic require
      // is preserved in the bundle and resolved at runtime by pkg.
      "@libsql/linux-x64-gnu",
      "@libsql/linux-arm64-gnu",
      "@libsql/darwin-arm64",
      "@libsql/darwin-x64",
      "@libsql/win32-x64-msvc",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],

    sourcemap: "linked",

    plugins: [
      esbuildPluginPino({ transports: ["pino-pretty"] }),
    ],
  };

  if (isCJS) {
    // Smoke-test hook: runs BEFORE any require() call in the generated CJS bundle,
    // so no external native modules (libsql, etc.) are loaded.  The build script
    // sets SENTINEL_SMOKE_TEST=1 and checks for exit code 0 + this output string.
    buildOptions.banner = {
      js: `if(process.env.SENTINEL_SMOKE_TEST==="1"){process.stdout.write("sentinel-sidecar-smoke-test: ok\\n");process.exit(0);}`,
    };
  } else {
    buildOptions.banner = {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);`,
    };
  }

  await esbuild(buildOptions);
}

buildAll().catch((error) => {
  console.error(error);
  process.exit(1);
});