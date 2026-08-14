# Maison Bastide

Site vitrine — torréfaction artisanale.

## Stack

- Vite + React 18 (JavaScript)
- Frames extraites via ffmpeg → `public/frames/`
- GSAP + ScrollTrigger (à venir)
- Lenis (à venir)

## Démarrer

```bash
npm install
npm run dev
```

## Extraire les frames

```bash
# Desktop (hero.mp4 → public/frames)
npm run frames

# Mobile 15 fps (hero-mobile.mp4 → public/frames-mobile)
npm run frames:mobile
```

Met à jour les `count` dans `src/App.jsx` si les totaux changent.
