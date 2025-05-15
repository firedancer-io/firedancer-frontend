import prettier from "eslint-config-prettier";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintReact from "eslint-plugin-react";
import eslintReactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

// Override type, the analyzer misses eslint-plugin-react's flat configs
/** @type {typeof eslintReact.configs} */
const eslintReactConfigsFlat = eslintReact.configs.flat;

// eslint-plugin-react-hooks specifies an incorrect value for `plugins`
const eslintReactHooksFlat = {
  recommended: {
    plugins: { "react-hooks": eslintReactHooks },
    rules: eslintReactHooks.configs.recommended.rules,
  },
};

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintReactConfigsFlat.recommended,
  eslintReactConfigsFlat["jsx-runtime"],
  eslintReactHooksFlat.recommended,
  prettier,
  { ignores: ["**/dist/"] },
  {
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-refresh": reactRefresh,
    },

    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "*.mjs",
            "src/d3Sankey/*.js",
            "src/uplot/*.js",
          ],
          defaultProject: "tsconfig.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "no-constant-condition": "warn",
      "no-debugger": "warn",
      "prefer-const": ["warn", { destructuring: "all" }],
      "react/jsx-curly-brace-presence": "warn",
      "react/jsx-uses-vars": "warn",
      "react/jsx-uses-react": "warn",

      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "@typescript-eslint/prefer-promise-reject-errors": [
        "error",
        { allowEmptyReject: true },
      ],
      "@typescript-eslint/consistent-type-assertions": "warn",
      "@typescript-eslint/no-redeclare": "warn",

      "default-case": "off", // superseded by @typescript-eslint/switch-exhaustiveness-check
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        {
          allowDefaultCaseForExhaustiveSwitch: false,
          requireDefaultForNonUnion: true,
        },
      ],

      "no-use-before-define": "off",
      "@typescript-eslint/no-use-before-define": [
        "warn",
        { functions: false, variables: false },
      ],

      "no-unused-expressions": "off",
      "@typescript-eslint/no-unused-expressions": [
        "error",
        {
          allowShortCircuit: true,
          allowTernary: true,
          allowTaggedTemplates: true,
        },
      ],

      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { args: "none", ignoreRestSiblings: true },
      ],

      "no-useless-constructor": "off",
      "@typescript-eslint/no-useless-constructor": "warn",
      "react/prop-types": "off",
    },
  }
);
