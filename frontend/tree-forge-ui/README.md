# Bosco Decision Trees frontend

React and TypeScript interface for building, inspecting, importing, and exporting decision trees.

Live frontend: [idt-ui.onrender.com](https://idt-ui.onrender.com).

## Local development

Run these commands from `frontend/tree-forge-ui`:

```sh
npm ci
npm run dev
```

The development server is configured for port **8080**. Use the local URL printed by Vite.

## Backend connection

The frontend reads `VITE_API_BASE_URL` at build time and defaults to `/api`.

For a separate backend, create a local `.env.local` file in this directory:

```dotenv
VITE_API_BASE_URL=http://localhost:5000/api
```

Point this value at the backend you are running, and allow the frontend origin in the backend's CORS configuration. Restart Vite after changing environment settings. Do not put credentials or secrets in frontend environment variables: they are included in the browser build.

## Build and preview

```sh
npm run build
npm run preview
```

Production files are generated in `dist/`. Preview serves the built frontend; a working backend connection is still required.

`npm run lint` runs the configured ESLint checks. The project currently has existing lint and TypeScript diagnostics; a successful Vite build does not mean all static checks pass.

## Deployment

The live frontend is hosted on Render. Commit and push changes to the repository branch connected to the frontend service, then confirm that Render has successfully deployed that commit before checking the live app.

Set `VITE_API_BASE_URL` in the build environment when the production API is hosted separately. Changing this value requires rebuilding the frontend. The host must serve `index.html` for frontend routes such as `/dashboard` and `/tree-visualization`.

For the repository's separate server/nginx deployment instructions, see [DEPLOYMENT.md](../../DEPLOYMENT.md).

## Source layout

- `src/pages/`: login, dashboard, tree creation, and visualization pages.
- `src/components/`: shared header, tree renderer, dialogs, and UI components.
- `src/services/`: authentication and API requests.
- `src/assets/`: application artwork and browser icon.
- `src/types/`: shared TypeScript types.

The frontend uses React, Vite, TypeScript, Tailwind CSS, shadcn/ui, and D3 hierarchy utilities.
