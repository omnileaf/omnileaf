import { createCn } from "cn/config";

export const TOKEN_THEME = {
  text: ["badge", "body", "heading", "label", "lead", "small", "title"],
  radius: ["card", "control", "full", "panel"],
  "font-weight": ["bold", "medium", "semibold"],
  shadow: ["card"],
  tracking: ["tight", "wide"],
} as const;

export const cn = createCn({ extend: { theme: TOKEN_THEME } });
