import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Advisory, not build-failing. This rule flags intentional, safe mount-time patterns we rely
      // on: the `setMounted(true)` hydration guard (theme SSR), reading localStorage / URL params on
      // mount (unavailable during SSR, so they MUST run in an effect), and seeding editable local
      // state from fetched props. Async-callback setState (fetch().then(setState)) is not flagged.
      // Keep it as a warning so the signal stays visible without blocking CI on idiomatic code.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
