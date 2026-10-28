# Relay design decisions

Style: Framed sheet, seed 949303732; no redraws. Brand palette and type kept before drawing.

Inventory: an agent's request, a human handoff, checklist steps, a pending state, a reply with images, two tool wings, copyable tool failures, a completed response, remembered window bounds, a disconnected display.

Primary question: What does the agent need me to do, and how do I hand the result back?

Face: paper-toned central sheet inside a sage-grey frame. Signature: tools hang on both sides of a single request, like equipment within reach of a kitchen order slip. The largest type is the actual request. The primary action hands the note back.

The three named scenarios and the Codex sender are sample content. The settings screen is a constructed demo. Capture generates an explicitly labeled sample PNG. Diagnostic errors are intentional simulated data.

Desktop target: 1440 × 900. Mobile omitted as explicitly allowed by the brief. The browser work-area clamp is implemented; native display work areas and DPI remain a desktop adapter responsibility.

Inspector allowances:
- heavy-shadow: the entire note is a draggable floating desktop-window preview, the exact overlay use permitted by the app rules. Inner paper and tools have no shadow.
- palette-cream: the paper tone comes from the user's physical sticky-note inspiration; it is paired with sage grey and dark green, without terracotta.
- tiny-text warning defended: the request and checklist use 25px / 13px; 11–12px is reserved for tool metadata and window chrome in a compact desktop utility.

Visual critique: the request leads, both wings and the reply are visible on the first screen, all central controls share the same paper edges, status colour is limited to meaningful feedback, and tools use honest idle/running/success/error states. The primary task is one click from the first screen. Default, dark target preview, evidence reply and completion states were inspected as screenshots.

Verification: production build; browser inspector; 26 end-to-end interaction checks. No native integration is claimed.
