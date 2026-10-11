# The Human Testament /data

This is the website content layer.

- `DESIGN.md` = how the site looks.
- `STITCH_MASTER_PROMPT.md` = what Stitch should build.
- `/data` = what the homepage displays.

Canonical text must remain exact.
Editorial prompts must never be presented as Testament verses.

Testament fixtures now live in `mock/testament/`. The mock provider adapts the preserved book summaries and supplied excerpts to the public content contracts. It does not contain the full corpus.

Reader components consume feature hooks and services rather than importing fixtures. New canonical content should come through the Testament domain provider. Other files here remain editorial/home copy; do not automatically treat their prompts as canonical verses.

See `../../docs/FRONTEND_ARCHITECTURE.md` for domain ownership, API configuration, routes, and the backend handoff.
