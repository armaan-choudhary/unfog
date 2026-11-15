# Design reference

## Source of truth and provenance

The product owner supplied the approved Figma Make dashboard screenshot in the
conversation. The original PNG is preserved unchanged at
[`references/approved-dashboard.png`](references/approved-dashboard.png).

- Artifact: Unfog Codebase Learning Dashboard, Figma Make browser capture.
- Capture dimensions: 1920 × 1080 pixels (PNG, RGBA).
- The capture includes browser and Figma Make editor chrome. The visible product
  canvas begins near x=368, y=170 and continues to the right and bottom edges;
  1920 × 1080 is the screenshot size, not a claim about the Figma frame size.
- The visible product shell is approximately 15% left navigation, 60% main
  workspace, and 20% learning-goal rail, with the remainder used by gutters.
  These are visual estimates from the capture, not source-frame constraints.
- The source file is the supplied conversation artifact. No separate Figma file
  export or editable design token file was supplied.

## Observed layout and hierarchy

1. Persistent left sidebar: Unfog mark, workspace navigation, current project,
   settings, and account area.
2. Main area: small uppercase section label and page greeting, followed by a
   prominent active-goal card with description, optional lesson context, action,
   and circular progress indicator.
3. Lower workspace: architecture map as the largest panel, with a compact
   semantic legend and a contextual Nimbus explanation strip below the map.
4. Right rail: learning goals with per-goal progress bars and a “view all”
   action.
5. Notifications and sync status sit at the upper right. Controls have visible
   selected, hover/focus, and action states in the design brief.

The screenshot shows a 1920 × 1080 browser capture. The implementation plan's
visual review targets remain 1440 × 900, 1280 × 800, and a narrow viewport;
those responsive layouts are not evidenced by this single image and must be
validated when the UI is implemented.

## Visual observations and proposed tokens

The page uses near-black charcoal backgrounds, slightly lighter charcoal panels,
subtle gray borders, off-white primary text, muted secondary text, and violet
for primary actions and selection. Teal, amber, blue, and rose distinguish map
concepts. The visible type is a clean sans serif: small tracked uppercase labels,
medium page and card headings, and compact muted descriptions. The exact font
family and Figma styles are not exposed by the screenshot.

The following initial CSS values are **proposals sampled or estimated from the
provided raster**, not recovered Figma tokens. Pixel colors can vary with
gradients, antialiasing, and screenshot rendering. Product-owner review is still
needed before treating the token map as final.

| Token | Proposed value | Basis |
|---|---:|---|
| Canvas | `#171719` | Sampled from an unadorned main-area background pixel |
| Sidebar | `#1C1C1F` | Sampled from the sidebar surface |
| Panel | `#202023` | Sampled from a map/card surface |
| Primary text | `#F1EEF3` | Sampled from a heading glyph; antialiasing affects the sample |
| Violet action | `#7665CA` | Sampled from the primary action button |
| Teal semantic accent | `#71C2BD` | Sampled from a map-node icon |
| Spacing scale | 4, 8, 12, 16, 24, 32 px | Estimated rhythm from visible gutters and card padding |
| Card radius | 12–16 px | Approximate from visible card corners |

The proposal is encoded in [`../frontend/styles/tokens.css`](../frontend/styles/tokens.css)
and is intentionally kept separate from the scaffold page styling.

## Product-rule conflicts and content handling

The screenshot includes a “7 day streak” card and weekly streak/momentum
indicators. These conflict with the approved product rule against streaks and
artificial engagement metrics. Preserve the overall layout and visual
hierarchy, but do not implement streaks; use a product-owner-approved,
evidence-backed alternative or omit that area.

The example project name, graph nodes and edges, lesson names, progress
percentages, sync time, and activity labels in the screenshot are reference
content only. They may appear in Unfog only when grounded in the user's actual
repository, snapshot, and learning evidence. Do not ship them as a hardcoded
analysis or progress demo.

Nimbus appears as a small contextual cloud guide near the map. Use approved
artwork when supplied; do not infer or fabricate the mascot asset from this
screenshot.

## Review status

- Screenshot selection and provenance: supplied by the product owner.
- Initial token map: proposed from raster observations; awaiting explicit
  product-owner review.
- Full-screen implementation and responsive validation: deferred to frontend
  tickets after design review.
