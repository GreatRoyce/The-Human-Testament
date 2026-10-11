# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
# The Human Testament frontend

React / Vite / Tailwind frontend. The Node.js backend is a separate project.

```sh
npm install
npm run dev
```

Content defaults to supplied mock excerpts. See `.env.example` for `VITE_CONTENT_SOURCE` and `VITE_API_URL`; API mode does not assume an existing backend or fall back to mock content.

Validation: `npm run lint`, `npm run build`, `npm test`, `npm run check:home`, `npm run check:content`.

See [frontend architecture and backend handoff](docs/FRONTEND_ARCHITECTURE.md) and [migration file inventory](docs/MIGRATION_FILES.md).
