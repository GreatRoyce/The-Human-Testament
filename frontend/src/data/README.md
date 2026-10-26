# The Human Testament /data

This is the website content layer.

- `DESIGN.md` = how the site looks.
- `STITCH_MASTER_PROMPT.md` = what Stitch should build.
- `/data` = what the homepage displays.

Canonical text must remain exact.
Editorial prompts must never be presented as Testament verses.

The default content source is `pdf`. `shared/manuscript.json` contains the complete verified transcription of `backend/data/The-Human-Testament--Complete-Manuscript.pdf`. Reader, search, quotations, and manuscript materials use this same dataset. The former `mock/testament/` exports are compatibility adapters to it; book descriptions remain editorial summaries.

Run `npm.cmd run content:check` from `backend/` to verify the bundle against the PDF and structured transcription. Frontend builds run that check automatically. See `shared/README.md` for regeneration and fidelity limits.

Reader components consume feature hooks and services rather than importing fixtures. New canonical content should come through the Testament domain provider. Other files here remain editorial/home copy; do not automatically treat their prompts as canonical verses.

See `../../docs/FRONTEND_ARCHITECTURE.md` for domain ownership, API configuration, routes, and the backend handoff.
