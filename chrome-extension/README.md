# Scholar Author ID Extractor - Chrome Extension

Chrome extension to streamline Google Scholar author ID extraction for the Academic Bioeng Explorer web app.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder from this project

## Usage

1. In the Web App, paste your staff list and extract professor names
2. Click "Open Scholar" on any researcher card
3. A new tab opens with Google Scholar author search results
4. The extension automatically adds "✅ Select This Author" buttons
5. Click the button next to the correct professor
6. The tab closes automatically and the ID is sent back to the web app

## How It Works

- **Injection**: Content script runs on Scholar author search pages
- **Detection**: Extracts author IDs from profile links
- **Communication**: Uses Broadcast Channel API to send data to web app
- **Auto-close**: Scholar tab closes after selection

## Files

- `manifest.json` - Extension configuration
- `content.js` - Main logic (button injection, ID extraction)
- `styles.css` - UI styling
- `icon*.png` - Extension icons

## Troubleshooting

**Extension not working?**
- Check that you're on a Scholar author search page (URL contains `view_op=search_authors`)
- Make sure you opened the page from the web app (URL needs `researcher_id` parameter)
- Check browser console for error messages

**Tab not closing?**
- Some browser security settings may prevent automatic tab closing
- You can manually close it after clicking "Select"

## Development

The extension uses:
- Manifest V3
- Broadcast Channel API for cross-tab communication
- Content scripts for DOM manipulation
- No background service worker needed (lightweight!)
