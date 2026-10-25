# User guide

LibreRoom removes the background of a photo and lets you put the subject on a new background, without uploading anything.

## 1. Import a photo

Any of these works:
- click **Choose an image** (or **Open**, Ctrl+O);
- drag a file onto the window;
- paste an image (Ctrl+V).

Supported formats: PNG, JPEG, WebP, up to 16,384 px per side.

## 2. Remove the background

1. Open **Remove BG** (left bar).
2. The first time only, click **Download the model**. The *Fast* model is 44 MB. LibreRoom shows where it comes from and checks its fingerprint. After that, it works offline.
3. Click **Remove background**. On a recent laptop it takes about 2–5 seconds, and the time is shown in the status bar.

Hold **Hold to see the original** (bottom left of the canvas) to compare.

## 3. Fix the cut-out

Open **Refine** and paint over the image:
- **Erase** removes leftovers of the old background;
- **Restore** brings back parts of the subject.

| Shortcut | Action |
|---|---|
| X | Switch Erase / Restore |
| [ and ] | Brush size |
| Space + drag, or middle button | Move around |
| Mouse wheel, + / -, 0 | Zoom, fit to screen |

*Discard my touch-ups* returns to the AI result.

## 4. Choose a new background

In **Background**, pick:
- transparent;
- a colour (presets or the rainbow swatch for any colour);
- **Use an image as background**.

## 5. Layers and text

Your photo is the first **layer**. You can stack more on top.

- **Layers** panel: **Add image** (several at once if you like) and **Add text**. You can also drop or paste images onto the canvas: each one becomes a layer. Dropping several images onto an empty editor opens the first and stacks the others on top.
- **Click** a layer on the canvas to select it, then **drag** it to move it. Clicking the empty part of a cut-out selects what is behind it.
- While you move a layer, it **snaps** to the canvas edges and centre and to other layers, and red guide lines show the alignment. Hold **Alt** to move freely.
- **Resize** with the square handles at the corners; the opposite corner stays in place. **Rotate** with the round handle above the layer (hold **Shift** for 15° steps).
- **Select several layers**: Shift- or Ctrl-click them (on the canvas or in the list), drag a rectangle over an empty area, or press Ctrl+A. You can then move, align, duplicate, change opacity or delete them together.
- **Align**: with one layer, the six align buttons place it against the canvas; with several, they align them with each other.
- **Shadow**: tick **Drop shadow**, then set its softness, offset, strength and colour. The shadow follows the cut-out shape or the letters.
- The list shows every layer, top first. You can **hide or show** one (eye icon), move it **up or down**, **duplicate** it (Ctrl+D), or **delete** it (trash icon, or the Delete key).

In **Text**, write your text (several lines allowed), then choose the font, size, colour, bold or italic, and alignment. **Double-click** a text on the canvas to edit it.

The AI tools (**Remove BG**, **Refine**) work on the selected image layer.

## 6. Export

In **Export**, choose the format and width, then **Export image**:
- **PNG** keeps transparency;
- **JPG** is smaller, and transparent areas become white;
- **WebP** offers both.

No watermark, and no size limit other than your computer's memory.

## Batch processing

Open **Batch** (left bar) to process many photos the same way:
1. Add or drop as many images as you like.
2. Choose whether to remove the background, then the background (transparent or a colour), the format and, optionally, a maximum size.
3. Click **Process**. Images are processed one at a time; each line shows its status and time. **Cancel** stops after the current image.
4. Download each result, or **Download all (ZIP)**.

Your original files are never modified: results are new files named `name-libreroom.png` (or `.jpg`, `.webp`). The AI model must be downloaded once first, in **Remove BG**.

## Keyboard shortcuts

Press **?** (or the keyboard button in the top bar) to see them all: undo/redo, select all, duplicate, delete, nudge with the arrow keys (Shift for 10 px), bring forward or send backward (Ctrl+] / Ctrl+[), zoom, and the brush keys.

## Saving your work

- **Save** (Ctrl+S) writes a `.libreroom` file holding all your layers (original photos, cut-outs, texts) and the background. Open it again with **Open**.
- **Undo / Redo**: Ctrl+Z and Ctrl+Shift+Z (or Ctrl+Y), or the arrows in the top bar.
- **Autosave**: if LibreRoom closes unexpectedly, your unsaved work is offered back the next time you open it (**Restore** or **Discard**).

## Privacy

Your images never leave your computer. The only time LibreRoom uses the network is when you click *Download the model*. There is no account, no tracking and no advertising.
