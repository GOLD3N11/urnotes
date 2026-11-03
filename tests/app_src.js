// Codul aplicației, în ordinea din index.html (js/*.js), lipit într-un singur text pentru teste.
const fs = require("fs"), path = require("path");
module.exports = dir => {
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  const files = [...html.matchAll(/<script src="((?:js|shared)\/[^"]+\.js)" defer><\/script>/g)].map(m => m[1]);
  if (!files.length) throw new Error("no js/ scripts in index.html");
  return "\"use strict\";\n" + files.map(f => fs.readFileSync(path.join(dir, f), "utf8").replace(/^\/\*[\s\S]*?\*\/\s*"use strict";/, "")).join("\n;\n");
};
