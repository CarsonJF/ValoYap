/** Design tokens. The renderer mirrors these as CSS custom properties. */
export const theme = {
  color: {
    bg: "#0f1923",
    panel: "#131f2b",
    text: "#ece8e1",
    accent: "#ff4655",
    muted: "#7b8a97",
    rule: "#2a3744",
  },
  /** 8px grid */
  space: (n: number) => n * 8,
  font: {
    display: "'Bebas Neue', 'Oswald', 'Anton', Impact, sans-serif",
    body: "'Inter', 'Segoe UI', sans-serif",
  },
} as const;
