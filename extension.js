/* extension.js - Drop-down quick note editor */
'use strict';

import St from 'gi://St';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

let quickNotes;

/**
 * Main extension class - Click icon to open drop-down note editor
 */
const QuickNoteEditor = GObject.registerClass(
    class QuickNoteEditor extends PanelMenu.Button {
    _init() {
        super._init(0, "Quick Note");

        // Panel icon
        let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        let icon = new St.Icon({
            icon_name: 'text-editor-symbolic',
            style_class: 'system-status-icon'
        });
        hbox.add_child(icon);
        this.add_child(hbox);

        // Setup notes directory
        this._notesDir = GLib.build_filenamev([GLib.get_home_dir(), '.quicknotes']);
        let dir = Gio.File.new_for_path(this._notesDir);
        if (!dir.query_exists(null)) {
            dir.make_directory_with_parents(null);
        }

        // The note file path
        this._noteFile = GLib.build_filenamev([this._notesDir, 'quick-note.md']);

        // Setup the drop-down menu (we'll use the menu system for the drop-down)
        this._buildDropDown();

        // Load existing note
        this._loadNote();

        // Connect click event to toggle the menu
        this.connect('button-press-event', () => {
            this.menu.toggle();
        });
    }

    _buildDropDown() {
        // Create the main container for the drop-down
        let mainBox = new St.BoxLayout({
            style_class: 'quick-note-dropdown',
            vertical: true,
            width: 400,
            height: 300
        });

        // Add custom CSS for sizing
        let css = `
            .quick-note-dropdown {
                padding: 12px;
                background-color: rgba(30, 30, 30, 0.95);
                border-radius: 8px;
                min-width: 400px;
                min-height: 300px;
            }
            .quick-note-textarea {
                background-color: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                padding: 8px;
                color: #ffffff;
                font-size: 14px;
                width: 100%;
                min-height: 200px;
                caret-color: #ffffff;
            }
            .quick-note-textarea:focus {
                border-color: rgba(255, 255, 255, 0.3);
            }
            .quick-note-button-row {
                spacing: 8px;
                margin-top: 10px;
            }
            .quick-note-button {
                padding: 6px 16px;
                border-radius: 4px;
                background-color: rgba(255, 255, 255, 0.1);
                color: #ffffff;
                font-weight: 500;
            }
            .quick-note-button:hover {
                background-color: rgba(255, 255, 255, 0.2);
            }
            .quick-note-button.save {
                background-color: #3584e4;
            }
            .quick-note-button.save:hover {
                background-color: #4a91e7;
            }
        `;

        // Create a style manager for our custom CSS
        let styleManager = new St.StyleManager({
            theme: St.Theme.make_default_theme(),
            stylesheet: css,
        });

        // Create the text area using St.Entry (multi-line)
        this._textArea = new St.Entry({
            style_class: 'quick-note-textarea',
            can_focus: true,
            width: 380,
            height: 200,
            x_expand: true,
            y_expand: true
        });

        // Make it multi-line (clutter_text is the underlying Clutter.Text)
        this._textArea.clutter_text.set_line_wrap(true);
        this._textArea.clutter_text.set_single_line_mode(false);
        this._textArea.clutter_text.set_editable(true);
        this._textArea.clutter_text.set_activatable(false);

        // Connect auto-save on text change
        this._textArea.clutter_text.connect('text-changed', () => {
            this._autoSave();
        });

        mainBox.add_child(this._textArea);

        // Button row
        let buttonRow = new St.BoxLayout({
            style_class: 'quick-note-button-row',
            x_align: St.Align.END
        });

        // Save button
        let saveButton = new St.Button({
            label: '💾 Save & Close',
            style_class: 'quick-note-button save',
            can_focus: true
        });
        saveButton.connect('clicked', () => {
            this._saveNote();
            this.menu.close();
        });
        buttonRow.add_child(saveButton);

        mainBox.add_child(buttonRow);

        // Wrap in a menu item
        let menuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false
        });
        menuItem.add_child(mainBox);

        // Clear any existing items and add our custom one
        this.menu.removeAll();
        this.menu.addMenuItem(menuItem);

        // Apply custom styles
        mainBox.add_style_class_name('quick-note-dropdown');
    }

    _loadNote() {
        try {
            let file = Gio.File.new_for_path(this._noteFile);
            if (file.query_exists(null)) {
                let [, contents] = file.load_contents(null);
                let text = new TextDecoder().decode(contents);
                this._textArea.clutter_text.set_text(text);
            } else {
                // Create default note
                let defaultText = '# Quick Note\n\nStart typing here...\n\nYour note will auto-save.';
                this._textArea.clutter_text.set_text(defaultText);
                this._saveNote();
            }
        } catch (e) {
            log(`Error loading note: ${e.message}`);
            // Set default text if loading fails
            this._textArea.clutter_text.set_text('# Quick Note\n\nStart typing...');
        }
    }

    _saveNote() {
        try {
            let text = this._textArea.clutter_text.get_text();
            let file = Gio.File.new_for_path(this._noteFile);
            let bytes = new TextEncoder().encode(text);
            file.replace_contents_bytes(bytes, null, false, Gio.FileCreateFlags.NONE, null);
        } catch (e) {
            log(`Error saving note: ${e.message}`);
        }
    }

    _autoSave() {
        // Auto-save with debounce (save after typing stops)
        if (this._saveTimeout) {
            GLib.source_remove(this._saveTimeout);
        }
        this._saveTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._saveNote();
            this._saveTimeout = null;
            return GLib.SOURCE_REMOVE;
        });
    }
});

/**
 * Main extension class
 */
export default class QuickNoteExtension {
    constructor() {
        this._indicator = null;
    }

    enable() {
        log('enabling quick-note extension');
        this._indicator = new QuickNoteEditor();
        Main.panel.addToStatusArea('quick-note', this._indicator, 0, 'right');
    }

    disable() {
        log('disabling quick-note extension');
        if (this._indicator) {
            // Save before destroying
            if (this._indicator._textArea) {
                let text = this._indicator._textArea.clutter_text.get_text();
                let file = Gio.File.new_for_path(this._indicator._noteFile);
                let bytes = new TextEncoder().encode(text);
                try {
                    file.replace_contents_bytes(bytes, null, false, Gio.FileCreateFlags.NONE, null);
                } catch (e) {
                    log(`Error saving on disable: ${e.message}`);
                }
            }
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}