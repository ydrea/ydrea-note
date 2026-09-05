"use strict";

import St from "gi://St";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";
import Pango from "gi://Pango";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

const QuickNoteEditor = GObject.registerClass(
  class QuickNoteEditor extends PanelMenu.Button {
    _init() {
      super._init(0.0, "Quick Note", false);

      let icon = new St.Icon({
        icon_name: "text-editor-symbolic",
        style_class: "system-status-icon",
      });
      this.add_child(icon);

      this._notesDir = GLib.get_home_dir() + "/.quicknotes";
      this._noteFile = this._notesDir + "/quick-note.md";

      let dir = Gio.File.new_for_path(this._notesDir);
      if (!dir.query_exists(null)) {
        try {
          dir.make_directory_with_parents(null);
        } catch (e) {}
      }
      this._menuOpenHandler = null;
      this._notifyTimeout = null;
      this._selectAllActive = false;

      this._buildMenuItems();
      this._loadNoteAsync();
    }

    _buildMenuItems() {
      this.menu.removeAll();

      let menuItem = new PopupMenu.PopupBaseMenuItem({
        reactive: false,
        can_focus: false,
      });

      let box = new St.BoxLayout({
        vertical: true,
        width: 440,
        height: 350,
        style:
          "padding: 12px; background-color: rgba(30,30,30,0.95); border-radius: 8px; spacing: 8px;",
      });

      let label = new St.Label({
        text: "Quick Note",
        style: "font-size: 14px; font-weight: bold; color: white;",
      });
      box.add_child(label);

      let scrollView = new St.ScrollView({
        width: 410,
        height: 220,
        style:
          "background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px;",
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        overlay_scrollbars: true,
      });

      this._textArea = new Clutter.Text({
        editable: true,
        selectable: true,
        reactive: true,
        single_line_mode: false,
        line_wrap: true,
        line_wrap_mode: Pango.WrapMode.WORD_CHAR,
        x_expand: true,
        y_expand: true,
      });

      this._textArea.set_cursor_visible(true);
      this._textArea.set_cursor_color(
        new Clutter.Color({ red: 255, green: 165, blue: 0, alpha: 255 }),
      );
      this._textArea.set_selection_color(
        new Clutter.Color({ red: 53, green: 255, blue: 122, alpha: 180 }),
      );
      this._textArea.set_selected_text_color(
        new Clutter.Color({ red: 255, green: 255, blue: 255, alpha: 255 }),
      );
      this._textArea.color = new Clutter.Color({
        red: 255,
        green: 255,
        blue: 255,
        alpha: 255,
      });
      this._textArea.font_name = "Monospace 13";

      // UNDO / REDO STATE
      this._undoStack = [];
      this._redoStack = [];
      this._isHistoryAction = false;

      this._textArea.connect("key-press-event", (actor, event) => {
        const symbol = event.get_key_symbol();
        const state = event.get_state();
        const ctrl = (state & Clutter.ModifierType.CONTROL_MASK) !== 0;

        // COPY (Ctrl+C)
        if (ctrl && (symbol === Clutter.KEY_c || symbol === Clutter.KEY_C)) {
          this._actionCopy();
          return Clutter.EVENT_STOP;
        }

        // CUT (Ctrl+X)
        if (ctrl && (symbol === Clutter.KEY_x || symbol === Clutter.KEY_X)) {
          this._actionCut();
          return Clutter.EVENT_STOP;
        }

        // PASTE (Ctrl+V)
        if (ctrl && (symbol === Clutter.KEY_v || symbol === Clutter.KEY_V)) {
          this._actionPaste();
          return Clutter.EVENT_STOP;
        }

        // SELECT ALL (Ctrl+A)
        if (ctrl && (symbol === Clutter.KEY_a || symbol === Clutter.KEY_A)) {
          this._actionSelectAll();
          return Clutter.EVENT_STOP;
        }

        // UNDO (Ctrl+Z)
        if (ctrl && (symbol === Clutter.KEY_z || symbol === Clutter.KEY_Z)) {
          this._actionUndo();
          return Clutter.EVENT_STOP;
        }

        // REDO (Ctrl+Y)
        if (ctrl && (symbol === Clutter.KEY_y || symbol === Clutter.KEY_Y)) {
          if (this._redoStack.length > 0) {
            let nextState = this._redoStack.pop();
            this._undoStack.push(nextState);

            this._isHistoryAction = true;
            this._textArea.set_text(nextState.text);
            this._textArea.set_cursor_position(nextState.cursor);
            this._isHistoryAction = false;
            this._showNotification("Redone!");
          }
          return Clutter.EVENT_STOP;
        }

        // Clear 'Select All' flag on regular typing
        if (!ctrl) {
          this._selectAllActive = false;
        }

        return Clutter.EVENT_PROPAGATE;
      });

      let textContainer = new St.BoxLayout({
        style: "padding: 8px;",
        x_expand: true,
        y_expand: true,
      });
      textContainer.add_child(this._textArea);
      scrollView.set_child(textContainer);
      box.add_child(scrollView);

      this._statusLabel = new St.Label({
        text: "Loading...",
        style: "font-size: 14px; color: rgba(255,165,0,0.9);",
      });
      box.add_child(this._statusLabel);

      this._textArea.connect("text-changed", () => {
        if (!this._isHistoryAction) {
          let text = this._textArea.get_text();
          let cursor = this._textArea.get_cursor_position();

          if (
            this._undoStack.length === 0 ||
            this._undoStack[this._undoStack.length - 1].text !== text
          ) {
            this._undoStack.push({ text, cursor });
            if (this._undoStack.length > 50) this._undoStack.shift();
            this._redoStack = [];
          }
        }
        this._autoSave();
      });

      // BUTTONS ROW
      let btnRow = new St.BoxLayout({
        style: "margin-top: 4px; spacing: 4px;",
      });

      let saveBtn = new St.Button({
        label: "Save",
        style:
          "padding: 4px 10px; background: #3584e4; color: white; border-radius: 4px;",
        can_focus: false,
      });
      saveBtn.connect("clicked", () => {
        this._saveNote();
        this.menu.close();
      });
      btnRow.add_child(saveBtn);

      let undoBtn = new St.Button({
        label: "Undo",
        style:
          "padding: 4px 10px; background: rgba(255,255,255,0.1); color: white; border-radius: 4px;",
        can_focus: false,
      });
      undoBtn.connect("clicked", () => this._actionUndo());
      btnRow.add_child(undoBtn);

      let pasteBtn = new St.Button({
        label: "Paste",
        style:
          "padding: 4px 10px; background: rgba(255,255,255,0.1); color: white; border-radius: 4px;",
        can_focus: false,
      });
      pasteBtn.connect("clicked", () => this._actionPaste());
      btnRow.add_child(pasteBtn);

      let copyBtn = new St.Button({
        label: "Copy",
        style:
          "padding: 4px 10px; background: rgba(255,255,255,0.1); color: white; border-radius: 4px;",
        can_focus: false,
      });
      copyBtn.connect("clicked", () => this._actionCopy());
      btnRow.add_child(copyBtn);

      let cutBtn = new St.Button({
        label: "Cut",
        style:
          "padding: 4px 10px; background: rgba(255,255,255,0.1); color: white; border-radius: 4px;",
        can_focus: false,
      });
      cutBtn.connect("clicked", () => this._actionCut());
      btnRow.add_child(cutBtn);

      let allBtn = new St.Button({
        label: "All",
        style:
          "padding: 4px 10px; background: rgba(255,255,255,0.1); color: white; border-radius: 4px;",
        can_focus: false,
      });
      allBtn.connect("clicked", () => this._actionSelectAll());
      btnRow.add_child(allBtn);

      box.add_child(btnRow);

      menuItem.add_child(box);
      this.menu.addMenuItem(menuItem);

      this._menuOpenHandler = this.menu.connect(
        "open-state-changed",
        (menu, open) => {
          if (open) {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
              global.stage.set_key_focus(this._textArea);
              this._textArea.grab_key_focus();
              return GLib.SOURCE_REMOVE;
            });
          }
        },
      );
    }

    // --- ACTION METHODS ---
    _showNotification(msg) {
      this._statusLabel.set_text(msg);
      if (this._notifyTimeout) GLib.source_remove(this._notifyTimeout);
      this._notifyTimeout = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        1500,
        () => {
          this._statusLabel.set_text("Saved");
          this._notifyTimeout = null;
          return GLib.SOURCE_REMOVE;
        },
      );
    }

    _actionCopy() {
      let fullText = this._textArea.get_text() || "";
      if (!fullText) {
        this._showNotification("Nothing selected");
        return;
      }

      let cursor = this._textArea.get_cursor_position();
      let bound = this._textArea.get_selection_bound();
      let start = Math.min(cursor, bound);
      let end = Math.max(cursor, bound);

      let selection = "";
      if (this._selectAllActive) {
        selection = fullText;
      } else if (start !== end) {
        selection = fullText.substring(start, end);
      }

      if (selection) {
        St.Clipboard.get_default().set_text(
          St.ClipboardType.CLIPBOARD,
          selection,
        );
        this._showNotification("Copied!");
      } else {
        this._showNotification("Nothing selected");
      }
    }

    _actionCut() {
      let fullText = this._textArea.get_text() || "";
      if (!fullText) return;

      if (this._selectAllActive) {
        St.Clipboard.get_default().set_text(
          St.ClipboardType.CLIPBOARD,
          fullText,
        );
        this._textArea.set_text("");
        this._selectAllActive = false;
        this._showNotification("Cut!");
        this._autoSave();
        return;
      }

      let cursor = this._textArea.get_cursor_position();
      let bound = this._textArea.get_selection_bound();
      if (cursor === bound) return;

      let start = Math.min(cursor, bound);
      let end = Math.max(cursor, bound);
      let selection = fullText.substring(start, end);

      if (selection) {
        St.Clipboard.get_default().set_text(
          St.ClipboardType.CLIPBOARD,
          selection,
        );
        this._textArea.delete_text(start, end);
        this._textArea.set_cursor_position(start);
        this._textArea.set_selection_bound(start);
        this._showNotification("Cut!");
        this._autoSave();
      }
    }

    _actionPaste() {
      St.Clipboard.get_default().get_text(
        St.ClipboardType.CLIPBOARD,
        (clip, textToPaste) => {
          if (textToPaste) {
            if (this._selectAllActive) {
              this._textArea.set_text(textToPaste);
              this._textArea.set_cursor_position(textToPaste.length);
              this._selectAllActive = false;
            } else {
              let cursor = this._textArea.get_cursor_position();
              let bound = this._textArea.get_selection_bound();

              if (cursor !== bound) {
                let start = Math.min(cursor, bound);
                let end = Math.max(cursor, bound);
                this._textArea.delete_text(start, end);
                cursor = start;
              }

              this._textArea.insert_text(textToPaste, cursor);
              this._textArea.set_cursor_position(cursor + textToPaste.length);
              this._textArea.set_selection_bound(cursor + textToPaste.length);
            }

            this._showNotification("Pasted!");
            this._autoSave();
          }
        },
      );
    }

    _actionSelectAll() {
      let text = this._textArea.get_text() || "";
      this._textArea.set_cursor_position(0);
      this._textArea.set_selection_bound(text.length);
      this._selectAllActive = true;
      this._showNotification("Selected All!");
    }

    _actionUndo() {
      if (this._undoStack.length > 1) {
        let currentState = this._undoStack.pop();
        this._redoStack.push(currentState);

        let prevState = this._undoStack[this._undoStack.length - 1];

        this._isHistoryAction = true;
        this._textArea.set_text(prevState.text);
        this._textArea.set_cursor_position(prevState.cursor);
        this._isHistoryAction = false;
        this._selectAllActive = false;

        this._showNotification("Undone!");
        this._autoSave();
      } else {
        this._showNotification("Nothing to undo");
      }
    }

    // --- FILE HANDLING ---
    _loadNoteAsync() {
      let file = Gio.File.new_for_path(this._noteFile);
      if (!file.query_exists(null)) {
        let defaultText = "# Quick Note\n\nStart typing...";
        this._textArea.set_text(defaultText);
        this._saveNote();
        this._statusLabel.set_text("Created");
        return;
      }

      let cancellable = new Gio.Cancellable();
      file.load_contents_async(cancellable, (source, result) => {
        try {
          let [success, contents] = source.load_contents_finish(result);
          if (success && contents) {
            this._textArea.set_text(new TextDecoder().decode(contents));
            this._undoStack.push({
              text: this._textArea.get_text(),
              cursor: 0,
            });
            this._statusLabel.set_text("Loaded");
          }
        } catch (e) {}
      });
    }

    _saveNote() {
      let text = this._textArea.get_text() || "# Quick Note\n\nStart typing...";
      let file = Gio.File.new_for_path(this._noteFile);
      let bytes = new GLib.Bytes(new TextEncoder().encode(text));

      file.replace_contents_bytes_async(
        bytes,
        null,
        false,
        Gio.FileCreateFlags.NONE,
        null,
        (source, result) => {
          try {
            source.replace_contents_finish(result);
            if (!this._notifyTimeout) this._statusLabel.set_text("Saved");
          } catch (e) {
            this._statusLabel.set_text("Error saving");
          }
        },
      );
    }

    _autoSave() {
      if (this._saveTimeout) GLib.source_remove(this._saveTimeout);
      if (!this._notifyTimeout) this._statusLabel.set_text("Saving...");
      this._saveTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        this._saveNote();
        this._saveTimeout = null;
        return GLib.SOURCE_REMOVE;
      });
    }

    destroy() {
      if (this._saveTimeout) GLib.source_remove(this._saveTimeout);
      if (this._notifyTimeout) GLib.source_remove(this._notifyTimeout);
      if (this._menuOpenHandler) this.menu.disconnect(this._menuOpenHandler);
      super.destroy();
    }
  },
);

export default class QuickMDNotesExtension extends Extension {
  enable() {
    this._indicator = new QuickNoteEditor();
    Main.panel.addToStatusArea(this.uuid, this._indicator);
  }
  disable() {
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
  }
}
