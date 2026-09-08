# Meal Spin

Responsive food roulette that uses your location and OpenStreetMap (Overpass API) to pick a nearby restaurant. No API key required.

## Setup

```bash
npm install
cp .env.example .env   # optional; PORT and Overpass URL overrides only
```

Thumbnails come from OpenStreetMap `image` / Wikimedia tags when present. Otherwise the card shows the first letter of the name. No Google photo API.

## Run

```bash
npm start
```

Open `http://localhost:8080`. Check what to recommend (all on by default), spin, then swipe the card left to skip or right to pick. Skips last for the browser session only. Maps links appear after you swipe right.

## Scripts

| Command        | Description                                      |
|----------------|--------------------------------------------------|
| `npm start`    | Start Express on PORT                            |
| `npm run dev`  | Start Express and reload when `server.js` changes |
| `npm test`     | Run Node built-in tests                          |
