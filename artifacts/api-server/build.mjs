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
  const requestedOutfile = getArg("outfile");

  const isCJS = requestedFormat === "cjs";

  const buildOptions = {
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: requestedFormat,
    logLevel: "info",

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
      "@libsql/client",
      "@libsql/linux-x64-gnu",
      "@libsql/linux-arm64-gnu",
      "@libsql/darwin-arm64",
      "@libsql/darwin-x64",
      "@libsql/win32-x64-msvc",
      "libsql",
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

  if (requestedOutfile) {
    const absoluteOutfile = path.resolve(artifactDir, requestedOutfile);

    await rm(path.dirname(absoluteOutfile), {
      recursive: true,
      force: true,
    });

    buildOptions.outfile = absoluteOutfile;
  } else {
    const distDir = path.resolve(artifactDir, "dist");

    await rm(distDir, {
      recursive: true,
      force: true,
    });

    buildOptions.outdir = distDir;
    buildOptions.outExtension = {
      ".js": isCJS ? ".cjs" : ".mjs",
    };
  }

  if (!isCJS) {
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