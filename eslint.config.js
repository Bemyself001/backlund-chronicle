import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

const sourceFiles = ["**/*.{js,jsx}"];

export default [
  { ignores: ["dist"] },
  {
    ...js.configs.recommended,
    files: sourceFiles,
  },
  {
    ...reactHooks.configs["recommended-latest"],
    files: sourceFiles,
  },
  {
    ...reactRefresh.configs.vite,
    files: sourceFiles,
  },
  {
    files: sourceFiles,
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
    },
  },
];
