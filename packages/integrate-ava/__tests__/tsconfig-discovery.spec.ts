import test from "ava";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SUB_PROJECT_DIR = fileURLToPath(
  new URL("./fixtures/monorepo-root/sub-project/", import.meta.url),
);

const DECORATOR_SOURCE = `
function Count(...args) {
  globalThis.__argCount = args.length;
}
@Count
class Foo {}
void Foo;
`;

function transformInSubprocess(
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): { stdout: string; stderr: string; status: number | null } {
  const script = `
    const { OxcTransformer } = await import("@oxc-node/core");
    const transformer = new OxcTransformer(process.cwd());
    const result = await transformer.transformAsync(
      "decorator.ts",
      ${JSON.stringify(DECORATOR_SOURCE)},
    );
    process.stdout.write(result.source());
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_OPTIONS: undefined,
      TS_NODE_PROJECT: undefined,
      OXC_TSCONFIG_PATH: undefined,
      ...env,
    },
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

test("walks up to parent tsconfig.json when sub-project has none", (t) => {
  const { stdout, stderr, status } = transformInSubprocess(SUB_PROJECT_DIR);
  t.is(status, 0, `subprocess failed: ${stderr}`);
  t.regex(
    stdout,
    /_decorate\s*\(/,
    "legacy decorator helper should be emitted when experimentalDecorators is read from parent tsconfig",
  );
});

test("explicit TS_NODE_PROJECT wins over walk-up", (t) => {
  const { stdout, stderr, status } = transformInSubprocess(SUB_PROJECT_DIR, {
    TS_NODE_PROJECT: "/this/path/does/not/exist.json",
  });
  t.is(status, 0, `subprocess failed: ${stderr}`);
  t.notRegex(
    stdout,
    /_decorate\s*\(/,
    "walk-up must not run when TS_NODE_PROJECT is explicitly set, even if the file is missing",
  );
});
