import nextConfig from "eslint-config-next";

const eslintConfig = [
  {
    ignores: [
      "docs/**",
      ".claude/worktrees/**",
      "node_modules/**",
    ],
  },
  ...nextConfig,
];

export default eslintConfig;
