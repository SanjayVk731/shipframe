# Plugin assets (Figma Community)

These live in the Community listing only — not bundled into the plugin.

## What's here

- `icon.svg` — 128×128 source. Rounded square mark with a ticket + a Figma-blue dot.
- `cover.svg` — 1920×1080 source. Frame → ticket transformation with the tagline.

## What Figma actually wants

The publish dialog accepts PNG or SVG for the icon, and PNG/JPG for the cover. SVG should work for both; if Figma rejects the cover SVG, export to PNG first:

```bash
# Using rsvg-convert (brew install librsvg)
rsvg-convert -w 1920 -h 1080 cover.svg > cover.png
rsvg-convert -w 128 -h 128 icon.svg > icon.png

# Or open the SVG in Figma, drop it on a 1920×1080 frame, Export PNG.
```

## Carousel (optional, max 9)

Make real screenshots of the plugin running in Figma against a real Notion / Azure DevOps account:

1. SettingsView with provider radio + PAT field
2. CreateView with a real frame's thumbnail filled in
3. LinkedView showing "Open ticket"
4. The created ticket in Notion (callout block with Figma link)
5. The created work item in Azure DevOps (with attached thumbnail)

Save them here as `carousel/01.png`, `02.png`, etc.
