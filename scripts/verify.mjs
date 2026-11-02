#!/usr/bin/env node
/**
 * 一条命令（51 §2.4）。任何一步非 0 退出即整体失败。
 * 参数用数组传、shell:false —— 路径里有空格或中文时拼字符串必炸。
 */
import { spawnSync } from "node:child_process";

const node = process.execPath;

const steps = [
  ["typecheck", [node, "node_modules/typescript/bin/tsc", "--noEmit"]],
  ["lint", [node, "scripts/lint.mjs"]],
  ["build:test", [node, "scripts/build.mjs", "--test"]],
  // 不带目录参数：Windows 上 `node --test test/` 会把 tail slash 当成模块名解析（MODULE_NOT_FOUND）。
  // 无参数时 Node 会自己按 `**/*.test.mjs` 发现，且跳过 node_modules。
  ["test", [node, "--test"]],
  ["build", [node, "scripts/build.mjs"]],
];

for (const [name, [cmd, ...args]] of steps) {
  process.stdout.write(`\n— ${name}\n`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (r.status !== 0) {
    console.error(`\n✗ ${name} 失败`);
    process.exit(1);
  }
}

process.stdout.write("\nALL GREEN\n");
