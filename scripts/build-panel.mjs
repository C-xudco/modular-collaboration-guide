import { build } from "esbuild";
import { mkdir, writeFile, readFile } from "node:fs/promises";
await mkdir("generated", { recursive: true });
const result = await build({ entryPoints: ["ui/entry.tsx"], bundle: true, write: false, metafile: true, minify: true, format: "iife", target: "es2022", define: { "process.env.NODE_ENV": '"production"' } });
const js = result.outputFiles[0].text.replaceAll("</script", "<\\/script");
const css = await readFile("ui/panel.css", "utf8");
const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>协作指南</title><style>' + css + '</style></head><body><div id="root"></div><script>' + js + '</script></body></html>';
await writeFile("generated/panel-html.ts", "export const panelHtml = " + JSON.stringify(html) + ";\n");
// Retain the exact licenses of every dependency actually bundled into the panel.
const packages = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = [...input.matchAll(/node_modules\/((?:@[^/]+\/)?[^/]+)/g)].at(-1);
  if (m) packages.set(m[1], input.slice(0, m.index) + "node_modules/" + m[1]);
}
let notices = "# Third-party notices\n\n原创代码的 MIT 许可不替代以下预构建面板依赖的许可；其他开发依赖的许可见各软件包。\n";
for (const [name, root] of [...packages].sort(([a],[b]) => a.localeCompare(b))) {
  const meta = JSON.parse(await readFile(root + "/package.json", "utf8"));
  let license;
  for (const file of ["LICENSE", "LICENSE.md", "LICENSE.txt", "license", "license.md", "LICENSE-MIT"]) {
    try { license = await readFile(root + "/" + file, "utf8"); break; } catch {}
  }
  if (!license) throw new Error("Missing bundled dependency license: " + name);
  notices += "\n## " + name + " " + meta.version + "\n\n" + license + "\n";
}
await writeFile("THIRD_PARTY_NOTICES.md", notices);
console.log("Codex panel bundled (" + Math.round(html.length / 1024) + " KiB)");
