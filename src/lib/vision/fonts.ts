/**
 * Phase D.1 — curated Google Fonts shortlist.
 *
 * Opus picks a font from this list (per category) when generating the
 * per-document HTML template. Constraining the choice prevents "Helvetica
 * Neue" or vendor-specific names that won't load in the browser.
 *
 * Each font has a stable family name + a Google Fonts CSS URL. The
 * generated template's `fontImports` array references these URLs.
 */

export type FontCategory = "serif-body" | "sans-body" | "display" | "mono";

export interface CuratedFont {
  family: string;
  category: FontCategory;
  /** Google Fonts CSS2 URL with sensible weight axes for body or display use. */
  url: string;
}

export const CURATED_FONTS: CuratedFont[] = [
  // Serif body — for traditional / legal / formal documents
  {
    family: "Source Serif 4",
    category: "serif-body",
    url: "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap",
  },
  {
    family: "Lora",
    category: "serif-body",
    url: "https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&display=swap",
  },
  {
    family: "Crimson Pro",
    category: "serif-body",
    url: "https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;500;600;700&display=swap",
  },
  {
    family: "EB Garamond",
    category: "serif-body",
    url: "https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700&display=swap",
  },

  // Sans body — for modern / consumer / branded documents
  {
    family: "Inter",
    category: "sans-body",
    url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
  },
  {
    family: "Source Sans 3",
    category: "sans-body",
    url: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&display=swap",
  },
  {
    family: "Roboto",
    category: "sans-body",
    url: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap",
  },
  {
    family: "Open Sans",
    category: "sans-body",
    url: "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap",
  },

  // Display — for titles, headings, formal cover sheets
  {
    family: "Playfair Display",
    category: "display",
    url: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&display=swap",
  },
  {
    family: "Merriweather",
    category: "display",
    url: "https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700;900&display=swap",
  },
  {
    family: "Montserrat",
    category: "display",
    url: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap",
  },

  // Mono — for fixed-width annotations (form numbers, OCR routing strings)
  {
    family: "IBM Plex Mono",
    category: "mono",
    url: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap",
  },
  {
    family: "JetBrains Mono",
    category: "mono",
    url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap",
  },
  {
    family: "Source Code Pro",
    category: "mono",
    url: "https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;500;600&display=swap",
  },
];

/** Map family name → URL for quick template-time lookup. */
export const FONT_URL_BY_FAMILY: Record<string, string> = Object.fromEntries(
  CURATED_FONTS.map((f) => [f.family, f.url]),
);

/** Set of valid family names for prompt-side validation (rare runtime sanity check). */
export const CURATED_FONT_FAMILIES: ReadonlySet<string> = new Set(
  CURATED_FONTS.map((f) => f.family),
);

/**
 * Render the curated list as a markdown table for inclusion in the prompt.
 * Opus reads this to know what families and URLs are available.
 */
export function renderFontShortlistForPrompt(): string {
  const byCategory: Record<FontCategory, CuratedFont[]> = {
    "serif-body": [],
    "sans-body": [],
    display: [],
    mono: [],
  };
  for (const f of CURATED_FONTS) byCategory[f.category].push(f);

  const sections: string[] = [];
  const labels: Record<FontCategory, string> = {
    "serif-body": "Serif body",
    "sans-body": "Sans body",
    display: "Display / title",
    mono: "Mono",
  };
  for (const cat of Object.keys(byCategory) as FontCategory[]) {
    const fonts = byCategory[cat];
    sections.push(`**${labels[cat]}**`);
    for (const f of fonts) {
      sections.push(`- \`${f.family}\` → \`${f.url}\``);
    }
    sections.push("");
  }
  return sections.join("\n");
}
