# Amalfi Resort â€” Photo Assets

Place all resort photos, logos, and branding files in this folder.

## Suggested Organization

```
assets/
â”œâ”€â”€ photos/
â”‚   â”œâ”€â”€ exterior/        â† beach, entrance, aerial shots
â”‚   â”œâ”€â”€ rooms/           â† photos per room type
â”‚   â”‚   â”œâ”€â”€ ac-teepee/
â”‚   â”‚   â”œâ”€â”€ fan-kubo/
â”‚   â”‚   â”œâ”€â”€ ac-kubo/
â”‚   â”‚   â”œâ”€â”€ big-fan-kubo/
â”‚   â”‚   â”œâ”€â”€ pool-villa/
â”‚   â”‚   â”œâ”€â”€ beach-villa/
â”‚   â”‚   â””â”€â”€ owners-villa/
â”‚   â”œâ”€â”€ facilities/      â† pool, beach, kitchen, bonfire area
â”‚   â””â”€â”€ events/          â† guest photos, celebrations
â”‚
â”œâ”€â”€ logos/               â† Amalfi Resort logo files (PNG, SVG)
â””â”€â”€ branding/            â† color palette, fonts, brand guide
```

## Notes

- **For the website**: Room photos are served via Cloudinary (uploads go through the admin upload flow or Cloudinary dashboard directly).
- **For the chatbot**: The chatbot currently does not send photos in replies â€” photos here are for reference/web use only.
- **For admin receipts**: Guest payment receipts are stored in Cloudinary under the `amalfi-receipts/` folder, NOT here.
