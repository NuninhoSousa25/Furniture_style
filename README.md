Purpose	Link
Client → Kitchen	https://nuninhosousa25.github.io/Furniture_style/?room=kitchen

Client → Living Room	https://nuninhosousa25.github.io/Furniture_style/?room=living-room

Client → let them pick	https://nuninhosousa25.github.io/Furniture_style/

Your dev/admin link	https://nuninhosousa25.github.io/Furniture_style/?dev=true

https://nuninhosousa25.github.io/Furniture_style/this-or-that.html?room=potato


# Find Your Style, a furniture style quiz

A lightweight, swipe-based quiz that helps clients who do not yet know what they want discover their furniture style. They swipe through pieces, react to each one, and get a style profile they can send to your team as a starting point for a design conversation.

It is a single HTML file. No build step, no server required to try it. For a live site, the room content is loaded from JSON files you host yourself.

## Files in this kit

- `furniture-style-quiz-v2.html` - the current app (v2), ready to open or host.
- `furniture-style-quiz.html` - the previous version, kept for reference.
- `example-host/manifest.json` - example of the index file the app fetches.
- `example-host/living-room.json` - example room file.
- `example-host/kitchen.json` - example room file.

## What's new in v2

- **Notes on every piece.** Under each card there is an optional note field, so a client can say things like "love this couch" or "hate the colour". Notes ride along with the result.
- **A detailed result for your technicians.** The results screen now lists every reaction in order, with the piece name, the reaction (Never / Pass / Like / Love it), its style tags, and any note. The same piece-by-piece breakdown is included in the email, share, and copied text, so the team can read a client's taste reaction by reaction rather than just seeing a single top style.
- **A minimum of 20 pieces, then stop when you like.** Pieces are shown in a random order each run. A client answers at least 20 pieces (or all of them, if the room has fewer than 20). Once they pass 20, a "Stop & see my results" button appears so they can finish early; the quiz always ends on its own when every piece has been seen. Scoring is built only from the pieces actually answered, so stopping early stays fair.

## Running it

Open `furniture-style-quiz-v2.html` in any modern browser by double-clicking it. It works offline with a built-in starter set (one Living Room quiz with 24 pieces, twelve style categories). To put it on your website, upload the HTML file to your host and link to it like any other page.

## Sharing links with clients

You can shape what a link does with query parameters on the quiz URL:

- `.../furniture-style-quiz-v2.html?room=kitchen` - drops the client straight into one room and skips the picker. The `room` value matches either a room's `id` (from the manifest) or the slug of its name, so `?room=kitchen` and `?room=living-room` both work.
- `.../furniture-style-quiz-v2.html?dev=true` - your private link. This is the only link that shows the gear icon and lets you open the admin area.
- `.../furniture-style-quiz-v2.html` - with no parameters, the client sees the normal room picker. The gear icon is hidden.

For a room deep link that loads from a hosted manifest, the quiz waits for the manifest to load before jumping in, so it works the same on your live site.

Note: hiding the gear keeps the admin area out of a client's way, but it is not hard security. Anyone who guesses `?dev=true` can open it. That is fine here, because the admin area only edits a working copy in that one browser and downloads files; it cannot change the content you host.

## How it works for a client

1. If you publish more than one room, the client first picks a space (Kitchen, Living Room, and so on).
2. They swipe through the pieces in a random order, choosing one of four reactions per piece: Never, Pass, Like, or Love it. Never and Love it count double. They can add an optional note to any piece.
3. They answer at least 20 pieces (or all of them, if the room has fewer). After 20, a "Stop & see my results" button lets them finish early; otherwise it ends when every piece has been seen.
4. At the end they see their top style, a short description, an affinity bar for every style used in that room, and a piece-by-piece list of every reaction and note.
5. They can add their name and send the result to you by email, share it through their phone, or copy it. The message carries the full breakdown and every note.

## The admin area

Tap the gear icon in the top corner. From there you can:

- Set your business name and the email that results are sent to.
- Create, rename, and delete rooms.
- Add, edit, and remove style categories, including custom ones with their own color and description.
- Add pieces to a room with one or more style tags. The name and the image URL are both optional, so you can add a piece from just an image. Edit a piece later to rename it or replace its image.
- Load content from a hosted manifest URL.
- Download the JSON files you need to host.
- Import a full config backup, or reset everything.

Everything you do in the admin area is saved in that browser only. It is your working copy. To make it live for visitors, you publish the JSON files (see below).

## Publishing with hosted JSON, the recommended setup

The live quiz reads its rooms from JSON files you host. This keeps every visitor on the same catalog without needing a database.

1. Build your rooms, categories, and pieces in the admin area.
2. In the admin area under "Publish", download `manifest.json` and each room file.
3. Upload all of those files into the same folder on your host (your website, an S3 bucket, GitHub Pages, and so on).
4. Back in the admin area under "Hosted source", paste the full link to your `manifest.json` and load it. The app stores that link and will refresh from it automatically each time it opens.

After that, anyone who opens the quiz gets the rooms straight from your hosted files. To change the catalog later, edit and re-upload the JSON files.

### Important: cross-origin (CORS)

The simplest, trouble-free setup is to host the JSON files on the same site as the HTML file. If the JSON lives on a different domain, that host must send the `Access-Control-Allow-Origin` header, or the browser will block the request. Most static hosts and CDNs can be configured for this.

## JSON format

### manifest.json

```json
{
  "businessName": "Your Studio",
  "destinationEmail": "studio@example.com",
  "categories": [
    { "key": "scandinavian", "label": "Scandinavian", "color": "#E4DCC9", "desc": "Short description shown on results." }
  ],
  "rooms": [
    { "id": "living-room", "name": "Living Room", "file": "living-room.json" }
  ]
}
```

- `businessName` and `destinationEmail` are optional. If present, they override what is set locally.
- `categories` is the shared style vocabulary. Each `key` must be unique and is what pieces reference in their `tags`.
- `rooms` lists each quiz. `file` is resolved relative to the manifest location, so keeping everything in one folder is easiest.

### room files

```json
{
  "name": "Living Room",
  "pieces": [
    { "id": "lr01", "name": "Pale Oak Lounge Chair", "imageUrl": "https://your-site.com/img/oak.jpg", "tags": ["scandinavian"] }
  ]
}
```

- `imageUrl` can be empty. Empty shows a colored placeholder card with the piece name. Vertical photos fill the card; wider (landscape or square) photos are scaled to fit inside it so nothing important gets cropped.
- `tags` is a list of category keys. A piece can carry more than one tag, and a swipe applies to all of its tags.

## How scoring works

Each reaction adds a value to every tag on the current piece: Never is -2, Pass is -1, Like is +1, Love it is +2. At the end, each style is scored as the average reaction across the pieces that carried it, on a scale from -2 to +2. Averaging rather than summing means a style is not favored just because it has more pieces in the quiz. The styles are ranked by that average, and the top one becomes the profile.

For the fairest read, try to give each style a similar number of pieces per room, and aim for a healthy total (roughly 8 to 12 pieces per style across the room) so a single swipe does not swing the result too far.

**Practical tip — balance your pieces.** If one style has only 1 piece and the client happens to dislike it, that style scores −2 immediately, which may not reflect their real taste — they might have just disliked that specific piece. Aim for at least 3–5 pieces per style in each room. A single outlier reaction hurts far less when it is averaged over several pieces.

## Known limitations

- Results are sent by the client through their own email or share sheet. Nothing is captured automatically. Collecting results into an inbox or database without depending on the client would require a small backend.
- Admin edits live in one browser. Publishing through hosted JSON is what makes content shared and persistent.
- The HTML loads React, Tailwind, and a browser-side compiler from public CDNs at runtime, which is fine for a prototype but slower than a compiled build. For production traffic, consider compiling it into a static bundle.
- Pasting very large images as data URLs can exceed the browser storage limit. Prefer hosted image URLs.
