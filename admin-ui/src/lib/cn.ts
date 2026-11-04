import { createCn } from "cn/config";

export const TOKEN_THEME = {
  text: ["body", "heading", "label", "lead", "small", "title"],
  radius: ["card", "control", "full", "panel"],
  "font-weight": ["bold", "medium", "semibold"],
  tracking: ["tight", "wide"],
} as const;

export const cn = createCn({ extend: { theme: TOKEN_THEME } });
