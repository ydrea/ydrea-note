/* extension.js - Quick MD Notes */
'use strict';

import St from 'gi://St';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const QuickNoteEditor = GObject.registerClass(
class QuickNoteEditor extends PanelMenu.Button {
    _init() {
        // Use 0.0 for alignment, not 0
        super._init(0.0, 'Quick Note', false);

        // Add icon
        let icon = new St.Icon({
            icon_name: 'text-editor-symbolic',
            style_class: 'system-status-icon'
        });
        this.add_child(icon);

        // Setup directories
        this._notesDir = GLib.get_home_dir() + '/.quicknotes';
        this._noteFile = this._notesDir + '/quick-note.md';
        
        let dir = Gio.File.new_for_path(this._notesDir);
        if (!dir.query_exists(null)) {
            try {
                dir.make_directory_with_parents(null);
            } catch (e) {}
        }

        // Build menu content
        this._buildMenuItems();
        this._loadNote();
    }

    _buildMenuItems() {
        // Clear the menu
        this.menu.removeAll();

        // Create a custom menu item for our content
        let menuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false
        });

        // Main container
        let box = new St.BoxLayout({
            vertical: true,
            width: 400,
            height: 300,
            style: 'padding: 12px; background-color: rgba(30,30,30,0.95); border-radius: 8px;'
        });

        // Text area
        this._textArea = new St.Entry({
            can_focus: true,
            width: 370,
            height: 210,
            style: 'background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 8px; color: white; font-family: monospace;'
        });
        this._textArea.clutter_text.set_line_wrap(true);
        this._textArea.clutter_text.set_single_line_mode(false);
        this._textArea.clutter_text.connect('text-changed', () => {
            this._autoSave();
        });
        box.add_child(this._textArea);

        // Status
        this._statusLabel = new St.Label({
            text: 'Ready',
            style: 'font-size: 11px; color: rgba(255,255,255,0.8); margin-top: 4px;'
        });
        box.add_child(this._statusLabel);

        // Buttons
        let btnRow = new St.BoxLayout({
            style: 'margin-top: 8px; spacing: 8px;'
        });

        let saveBtn = new St.Button({
            label: 'Save & Close',
            style: 'padding: 6px 16px; background: #3584e4; color: white; border-radius: 4px;'
        });
        saveBtn.connect('clicked', () => {
            this._saveNote();
            this.menu.close();
        });
        btnRow.add_child(saveBtn);

        let closeBtn = new St.Button({
            label: 'Close',
            style: 'padding: 6px 16px; background: rgba(255,255,255,0.1); color: white; border-radius: 4px;'
        });
        closeBtn.connect('clicked', () => {
            this.menu.close();
        });
        btnRow.add_child(closeBtn);

        box.add_child(btnRow);
        menuItem.add_child(box);
        this.menu.addMenuItem(menuItem);
    }

    _loadNote() {
        try {
            let file = Gio.File.new_for_path(this._noteFile);
            if (file.query_exists(null)) {
                let [, contents] = file.load_contents(null);
                let text = new TextDecoder().decode(contents);
                this._textArea.clutter_text.set_text(text);
                this._statusLabel.set_text('Loaded');
            } else {
                this._textArea.clutter_text.set_text('# Quick Note\n\nStart typing...');
                this._saveNote();
                this._statusLabel.set_text('Created');
            }
        } catch (e) {
            this._statusLabel.set_text('Error');
        }
    }

    _saveNote() {
        try {
            let text = this._textArea.clutter_text.get_text();
            let file = Gio.File.new_for_path(this._noteFile);
            let stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
            let bytes = new TextEncoder().encode(text);
            stream.write_all(bytes, null);
            stream.close(null);
            this._statusLabel.set_text('Saved');
        } catch (e) {
            this._statusLabel.set_text('Save error');
        }
    }

    _autoSave() {
        if (this._saveTimeout) {
            GLib.source_remove(this._saveTimeout);
        }
        this._statusLabel.set_text('...');
        this._saveTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._saveNote();
            this._saveTimeout = null;
            return GLib.SOURCE_REMOVE;
        });
    }
});

export default class QuickMDNotesExtension extends Extension {
    enable() {
        console.log('[QuickMD] Enable called');
        this._indicator = new QuickNoteEditor();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        console.log('[QuickMD] Disable called');
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}