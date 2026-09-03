# Meal Spin

Responsive food roulette that uses your location and the Yelp Fusion API to pick a nearby restaurant.

## Setup

```bash
npm install
cp .env.example .env   # then set YELP_API_KEY
```

## Run

```bash
export YELP_API_KEY=your_key   # or use a .env loader of your choice
npm start
```

Open `http://localhost:8080`. The app shell loads even without a Yelp key; spins return `503` until `YELP_API_KEY` is set.

## Scripts

| Command     | Description              |
|-------------|--------------------------|
| `npm start` | Start Express on PORT    |
| `npm test`  | Run Node built-in tests  |
