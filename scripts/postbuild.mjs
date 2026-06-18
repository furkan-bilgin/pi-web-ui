import { chmodSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

// Make server executable
chmodSync(new URL("../dist/server/index.js", import.meta.url), 0o755);

// Generate dist/package.json for extension loading
const req = createRequire(import.meta.url);
const pkg = req("../package.json");
writeFileSync(
  new URL("../dist/package.json", import.meta.url),
  JSON.stringify(
    {
      name: "pi-web-ui",
      version: pkg.version,
      description: "pi web ui extension",
      main: "extension/index.js",
      type: "module",
      exports: { ".": "./extension/index.js" },
    },
    null,
    2
  ) + "\n"
);
