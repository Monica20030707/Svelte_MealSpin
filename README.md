# Meal Spin

Responsive food roulette that uses your location and OpenStreetMap (Overpass API) to pick a nearby restaurant. No API key required.

The UI is a Svelte app (`src/`). Express serves the API and the built files in `dist/`.

## Setup

```bash
npm install
cp .env.example .env   # optional; PORT and Overpass URL overrides only
```

Thumbnails come from OpenStreetMap `image` / Wikimedia tags when present. Otherwise the card shows the first letter of the name. No Google photo API.

## Run

```bash
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`). After the first spin, the top card is the recommendation; the cards behind stay blank.

For production:

```bash
npm run build
npm start
```

Then open `http://localhost:8080`.

Check what to recommend (all on by default), then swipe the top card left to skip or right to pick. Skips last for the browser session only. Maps links appear after you swipe right.

## Scripts

| Command        | Description                                      |
|----------------|--------------------------------------------------|
| `npm run dev`  | Vite + `/api` from Express                       |
| `npm run build`| Build the Svelte app into `dist/`                |
| `npm start`    | Serve `dist/` and the API on PORT                |
| `npm test`     | Build, then run Node built-in tests              |
