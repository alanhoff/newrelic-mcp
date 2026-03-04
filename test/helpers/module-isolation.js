import path from "node:path";
import { pathToFileURL } from "node:url";

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function importFreshFromCwd(relativePath) {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const url = pathToFileURL(absolutePath);
  url.searchParams.set("cacheBust", uniqueSuffix());
  return import(url.href);
}

export async function withEnv(overrides, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined || value === null) {
      delete process.env[key];
      continue;
    }
    process.env[key] = String(value);
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
