# WAD Maker

A lightweight browser-based Wii WAD editor for opening WAD files, previewing embedded image assets, replacing the icon with a PNG, and exporting the updated WAD.

Features:
- Open a Wii WAD file from disk
- Detect the WAD magic and basic metadata
- Scan the WAD for embedded PNG assets
- Preview the icon or embedded image in the browser
- Replace the selected image with a new PNG
- Export the changed WAD as a new `.wad` file

How to run:
1. Open `index.html` directly in a browser, or serve the folder with a local web server.
2. Choose a WAD file from the Open WAD button.
3. Click a detected asset or the preview, then choose a PNG to replace it.
4. Click Export as WAD to save the result.

Local web server example:

```bash
cd wadmaker-web
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

Notes:
- This project focuses on a practical browser workflow rather than a full low-level Wii WAD rewriter.
- It is best suited to WADs that contain embedded PNG assets and rely on a simple icon replacement workflow.
- For advanced game-specific WAD editing, a deeper parser and full WAD struct validation would be required.

