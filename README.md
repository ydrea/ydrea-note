# Quick MD Notes

A minimal, drop-down markdown note editor for GNOME Shell. Click the panel icon to quickly jot down notes with auto-save functionality.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![GNOME Shell: 45, 46](https://img.shields.io/badge/GNOME%20Shell-45%2C%2046-orange.svg)

## Features

- **Drop-down editor** – Opens from the top panel with a single click
- **Auto-save** – Notes are automatically saved as you type (with debounce)
- **Markdown support** – Edit `.md` files with proper formatting
- **Dark theme** – Clean, dark styling that matches GNOME's aesthetic
- **Persistent storage** – Notes are saved to `~/.quicknotes/quick-note.md`
- **Manual save** – Option to save and close with the save button

## Installation

### From Extensions.gnome.org (Recommended)

1. Visit [https://extensions.gnome.org](https://extensions.gnome.org)
2. Search for "Quick MD Notes"
3. Install with one click

### Manual Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/ydrea/quickMD.git ~/.local/share/gnome-shell/extensions/quickmd@ydrea.github.io
   ```

2. Restart GNOME Shell:
   - Press <kbd>Alt+F2</kbd>, type `r`, then press <kbd>Enter</kbd>
   - Or run: `gnome-shell --replace &`

3. Enable the extension:
   - Open GNOME Extensions app (`gnome-extensions-app`)
   - Toggle "Quick MD Notes" to ON

## Usage

1. Click the note icon (📝) in your top panel
2. Start typing in the drop-down editor
3. Your notes are auto-saved to `~/.quicknotes/quick-note.md`
4. Click "💾 Save & Close" or click outside to close

### Keyboard Shortcuts

- **Auto-save**: Triggered after 1 second of inactivity
- **Manual save**: Click the save button or close the dropdown

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Note file | `~/.quicknotes/quick-note.md` | Where notes are stored |
| Auto-save delay | 1000ms | Time before auto-save triggers |
| Editor width | 400px | Width of the drop-down editor |
| Editor height | 300px | Height of the drop-down editor |

### Custom Note Location

To change where notes are saved, modify line 33 in `extension.js`:
```javascript
this._notesDir = GLib.build_filenamev([GLib.get_home_dir(), '.quicknotes']);
```

## Project Structure

```
ydrea-note/
├── extension.js      # Main extension code
├── metadata.json     # Extension metadata
├── stylesheet.css    # Custom styles
└── README.md         # This file
```

## Development

### Prerequisites

- GNOME Shell 45 or 46
- GNOME Shell development tools

### Testing Changes

1. Make your changes to `extension.js` or `stylesheet.css`
2. Restart GNOME Shell: <kbd>Alt+F2</kbd> → `r` → <kbd>Enter</kbd>
3. Check the looking glass (<kbd>Alt+F2</kbd> → `lg` → <kbd>Enter</kbd>) for errors

### Debugging

View logs with:
```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

Or use the GNOME Shell Looking Glass debugger.

## License

MIT License – see [LICENSE](https://github.com/ydrea/quickMD/blob/main/LICENSE) for details.

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you'd like to change.

## Acknowledgments

- Built with GNOME Shell JavaScript APIs
- Inspired by the need for quick, distraction-free note taking
- Thanks to all contributors and testers

---

**Author**: [ydrea](https://github.com/ydrea)
**Repository**: [ydrea/quickMD](https://github.com/ydrea/quickMD)
