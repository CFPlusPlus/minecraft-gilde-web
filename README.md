<p align="center">
  <a href="https://minecraft-gilde.de" target="_blank" rel="noopener noreferrer">
  <img src="https://minecraft-gilde.de/images/logo-big.webp" alt="Minecraft Gilde" width="360" />
</p>

<p align="center">
  <a href="https://discord.minecraft-gilde.de" target="_blank" rel="noopener noreferrer">
    <img alt="Discord" src="https://img.shields.io/discord/1219625244906754093?label=Discord&logo=discord&logoColor=white" />
  </a>
</p>

# Minecraft Gilde Web

Offizielle Website von **Minecraft-Gilde.de** (Minecraft-Server: **Minecraft Gilde**) – gebaut mit **Astro**.

Dieses Repository enthält das Frontend (Pages, Layouts, Komponenten) sowie Content-Daten (Regeln & Befehle) über **Astro Content Collections**.

## Tech-Stack

- **Astro** (Static Site Generation)
- **TypeScript**
- **Vanilla JS** für interaktive Seiten (z. B. Stats/Playerstats)
- **CSS** über Dateien in `public/css/`

## Inhalte pflegen

- **Befehle:** `src/content/commands/list.json`
- **Regeln:** `src/content/rules/main.json`

> Hinweis: In den Regeln werden Abschnitte als HTML-Strings gespeichert (z. B. für Formatierung/Listen). Bitte entsprechend sauber escapen.

---

## Projektstruktur

Im Projekt-Ordner findest du typischerweise die folgenden Ordner und Dateien:

```text
/
├── public/
│   ├── .htaccess
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── css/
│   ├── images/
│   └── js/
├── src/
│   ├── assets/
│   ├── components/
│   │   └── ui/
│   ├── content/
│   │   ├── commands/
│   │   ├── rules/
│   │   └── config.ts
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   └── Layout.astro
│   └── pages/
│       ├── index.astro
│       ├── rules.astro
│       ├── befehle.astro
│       ├── stats.astro
│       └── playerstats.astro
├── astro.config.mjs
└── package.json
```

Mehr zur Ordnerstruktur von Astro findest du in der offiziellen Doku: https://docs.astro.build/en/basics/project-structure/

---

## Befehle

Alle Befehle werden im Projekt-Root in einem Terminal ausgeführt:

| Befehl                    | Aktion                                              |
| :------------------------ | :-------------------------------------------------- |
| `npm install`             | Installiert Abhängigkeiten                          |
| `npm run dev`             | Startet den lokalen Dev-Server auf `localhost:4321` |
| `npm run build`           | Baut die Produktionsseite nach `./dist/`            |
| `npm run preview`         | Preview des Builds lokal vor dem Deploy             |
| `npm run astro ...`       | CLI-Befehle wie `astro add`, `astro check`          |
| `npm run astro -- --help` | Hilfe zur Astro-CLI anzeigen                        |

---

## Lokale Entwicklung

```bash
npm install
npm run dev
```

### API-Hinweis (Stats/Playerstats)

Die Seiten **Stats** und **Playerstats** rufen Endpunkte unter `/api/...` auf (z. B. `api/metrics`, `api/player`, `api/profile`).

- In Produktion existiert die API unter `https://minecraft-gilde.de/api/`.
- Lokal brauchst du entweder eine laufende API unter `http://localhost:4321/api/...` (Reverse Proxy) oder du richtest in `astro.config.mjs` einen Dev-Proxy ein (Vite Proxy).

Beispiel für einen Dev-Proxy (optional):

```js
// astro.config.mjs
export default defineConfig({
  vite: {
    server: {
      proxy: {
        '/api': 'http://localhost:8080',
      },
    },
  },
});
```

---

## Deployment

- `npm run build` erzeugt die statische Ausgabe in `dist/`.
- Alles aus `public/` wird 1:1 nach `dist/` kopiert (z. B. `.htaccess`, `robots.txt`, `sitemap.xml`).
