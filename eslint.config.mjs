import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Environment values may only be read in src/config.ts (STACK.md decision).
  // This is the code-level enforcement of the catchandtrade lesson where three
  // overlapping URL helpers and 20 copied env reads rotted the codebase.
  {
    files: ["src/**/*.{js,mjs,cjs,ts,tsx}"],
    ignores: ["src/config.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Read environment values through src/config.ts instead.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
