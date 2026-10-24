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

- **Layers** panel: **Add image** (or drop or paste an image onto the canvas) and **Add text**.
- **Click** a layer on the canvas to select it, then **drag** it to move it. Clicking the empty part of a cut-out selects what is behind it.
- With a layer selected, the panel sets its **size**, **rotation** and **opacity**. You can centre it, or reset it.
- The list shows every layer, top first. You can **hide or show** one (eye icon), move it **up or down**, or **delete** it (trash icon, or the Delete key).

In **Text**, write your text (several lines allowed), then choose the font, size, colour, bold or italic, and alignment. **Double-click** a text on the canvas to edit it.

The AI tools (**Remove BG**, **Refine**) work on the selected image layer.

## 6. Export

In **Export**, choose the format and width, then **Export image**:
- **PNG** keeps transparency;
- **JPG** is smaller, and transparent areas become white;
- **WebP** offers both.

No watermark, and no size limit other than your computer's memory.

## Saving your work

- **Save** (Ctrl+S) writes a `.libreroom` file holding all your layers (original photos, cut-outs, texts) and the background. Open it again with **Open**.
- **Undo / Redo**: Ctrl+Z and Ctrl+Shift+Z (or Ctrl+Y), or the arrows in the top bar.
- **Autosave**: if LibreRoom closes unexpectedly, your unsaved work is offered back the next time you open it (**Restore** or **Discard**).

## Privacy

Your images never leave your computer. The only time LibreRoom uses the network is when you click *Download the model*. There is no account, no tracking and no advertising.
