# Meal Spin

Responsive food roulette that uses your location and OpenStreetMap (Overpass API) to pick a nearby restaurant. No API key required.

## Setup

```bash
npm install
cp .env.example .env   # optional; PORT and Overpass URL overrides only
```

## Run

```bash
npm start
```

Open `http://localhost:8080`. Spins query Overpass for restaurants, cafes, and fast food near the given coordinates.

## Scripts

| Command        | Description                                      |
|----------------|--------------------------------------------------|
| `npm start`    | Start Express on PORT                            |
| `npm run dev`  | Start Express and reload when `server.js` changes |
| `npm test`     | Run Node built-in tests                          |
