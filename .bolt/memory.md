# Project memory

## Product intent & audience

- Smart TV style live streaming web platform (frontend only).
- Core features: video player, channel grid, EPG (electronic program guide), remote control navigation.
- Target audience: end users navigating via TV remote/D-pad on a TV-style UI.

## Brand personality & voice

- Support responses delivered in Portuguese (user's language).
- Tone: direct, helpful, practical.

## Visual design & UX direction

- Pure HTML5 + CSS3 + vanilla JavaScript (no framework).
- TV/10-foot UI patterns expected: large clickable cards, focus highlight states, D-pad/arrow key navigation.
- Project structure: `index.html`, `css/style.css`, `js/app.js`, `README.md`.
- Runs directly by opening `index.html`, or via `npm install && npm run dev` for a local server.

## Decisions, constraints & rationale

- No frontend framework — plain HTML/CSS/JS only.
- `npm run dev` available but optional; static file opening is the simplest path.
- Project download via Bolt UI (desktop only, ZIP export).

## Open questions & assumptions

- No explicit `.bolt/prompt` provided; global instructions currently none.
- Video sources, channel data, and EPG data format not yet specified.
- Accessibility and key-mapping details for remote navigation not yet defined.