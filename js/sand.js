/* ==========================================================
   Sand Pictures — game logic

   How it works, in short:
   - The screen is divided into a grid of tiny squares ("cells").
   - Each cell is either empty (0) or holds a grain of sand
     (a number that stores the grain's color).
   - Many times per second, every grain tries to fall:
       1. if the cell below is free, it falls straight down;
       2. otherwise it tries to slide down to the left or right;
       3. if that doesn't work either, it stays put (it has settled).
   - While the child holds a finger (or the mouse) down, new grains are added.
   ========================================================== */

(function () {
    "use strict";

    /* ------------------------------------------------------
       1. SETTINGS
       ------------------------------------------------------ */

    // The colors the kids can choose from. `name` is shown on screen (tooltip).
    // h = hue (0–360), s = saturation (%), l = lightness (%)
    const COLORS = [
        // Rainbow colors first, then browns, and finally white and grays
        { name: "Curcubeu",      rainbow: true },
        { name: "Vișiniu",       h: 345, s: 70, l: 38 },
        { name: "Roșu",          h: 0,   s: 85, l: 52 },
        { name: "Corai",         h: 8,   s: 90, l: 66 },
        { name: "Piersică",      h: 20,  s: 95, l: 76 },
        { name: "Portocaliu",    h: 28,  s: 95, l: 55 },
        { name: "Galben",        h: 50,  s: 95, l: 57 },
        { name: "Lămâie",        h: 65,  s: 90, l: 62 },
        { name: "Măsliniu",      h: 75,  s: 45, l: 38 },
        { name: "Verde deschis", h: 95,  s: 70, l: 60 },
        { name: "Verde",         h: 125, s: 65, l: 45 },
        { name: "Verde închis",  h: 150, s: 60, l: 28 },
        { name: "Mentă",         h: 155, s: 60, l: 72 },
        { name: "Turcoaz",       h: 175, s: 75, l: 46 },
        { name: "Bleu",          h: 195, s: 85, l: 72 },
        { name: "Albastru",      h: 212, s: 85, l: 55 },
        { name: "Bleumarin",     h: 230, s: 70, l: 40 },
        { name: "Indigo",        h: 250, s: 60, l: 50 },
        { name: "Mov",           h: 272, s: 60, l: 52 },
        { name: "Liliachiu",     h: 280, s: 65, l: 78 },
        { name: "Magenta",       h: 310, s: 85, l: 50 },
        { name: "Roz",           h: 330, s: 90, l: 74 },
        { name: "Crem",          h: 45,  s: 70, l: 86 },
        { name: "Nisip",         h: 42,  s: 70, l: 70 },
        { name: "Muștar",        h: 45,  s: 80, l: 45 },
        { name: "Cărămiziu",     h: 12,  s: 65, l: 45 },
        { name: "Maro",          h: 25,  s: 50, l: 38 },
        { name: "Ciocolatiu",    h: 20,  s: 45, l: 25 },
        { name: "Alb",           h: 40,  s: 15, l: 93 },
        { name: "Gri deschis",   h: 220, s: 10, l: 75 },
        { name: "Gri",           h: 220, s: 8,  l: 55 },
        { name: "Gri închis",    h: 220, s: 10, l: 32 }
    ];

    // How wide the sand stream is, in screen pixels
    // (same width on every screen). Bigger = more sand flows.
    const STREAM_RADIUS = 7.5;

    // How many new grains appear each frame, relative to the stream's area.
    // Bigger = a "fuller" stream.
    const STREAM_DENSITY = 0.3;

    // How small one grain of sand is, in screen pixels.
    // Smaller = finer sand, but more work for the computer.
    const GRAIN_SIZE = 1;

    // At most this many grains across the screen width (on very large screens
    // the grains get a little bigger so the game doesn't slow down).
    const MAX_COLUMNS = 2000;

    // The screen is divided into "chunks" of 32 × 32 grains.
    // Only chunks where something moves are updated; settled sand
    // is left alone. This keeps the game fast even with very fine sand.
    const CHUNK_SIZE = 32;

    // How much the sand spreads left and right while falling.
    // 0 = falls straight down; 0.15 = spreads a lot. Each grain gets,
    // when it appears, a small "kick" to the left or to the right.
    const SPREAD = 0.1;

    // A small random jitter, even for grains without a kick,
    // so the stream doesn't look like a perfect line.
    const JITTER = 0.03;

    // How fast the sand falls, in screen pixels per frame
    const FALL_SPEED = 8;

    // Background color, same as in the CSS (#1b1b2f).
    // Pixels are stored in A-B-G-R order (that's how the computer keeps them in memory).
    const BACKGROUND_COLOR = 0xff2f1b1b;

    // How fast the color changes in rainbow mode
    const RAINBOW_SPEED = 0.5;

    /* ------------------------------------------------------
       2. PAGE ELEMENTS
       ------------------------------------------------------ */

    const sandArea = document.getElementById("sandArea");
    const canvas = document.getElementById("canvas");
    const context = canvas.getContext("2d");
    const hint = document.getElementById("hint");
    const colorsContainer = document.getElementById("colors");
    const clearButton = document.getElementById("clearButton");
    const saveButton = document.getElementById("saveButton");
    const confirmDialog = document.getElementById("confirmDialog");
    const yesButton = document.getElementById("yesButton");
    const noButton = document.getElementById("noButton");

    /* ------------------------------------------------------
       3. GAME STATE
       ------------------------------------------------------ */

    let cellSize = 2;       // how many screen pixels one cell (one grain) takes
    let stepsPerFrame = 4;  // how many times the sand moves each frame
    let columns = 0;        // number of cells horizontally
    let rows = 0;           // number of cells vertically
    let grid = null;        // all cells: 0 = empty, anything else = grain color
    let drift = null;       // for each grain: which way it flies (-10 = left, 10 = right)
    let image = null;       // the image we draw on the canvas
    let pixels = null;      // the image's pixels, as numbers

    // Chunks: 1 = "awake" (must be updated), 0 = "asleep" (nothing moves)
    let chunkColumns = 0;
    let chunkRows = 0;
    let awake = null;       // chunks updated in the current step
    let awakeNext = null;   // chunks to update in the next step

    let selectedColor = COLORS[0]; // at start: rainbow
    let rainbowHue = Math.random() * 360;
    let draining = false;   // true while the sand is "flowing out" of the screen

    // Fingers (or the mouse) currently pressing on the screen.
    // For each one we remember where it is now and where it was before.
    const pointers = new Map();

    /* ------------------------------------------------------
       4. COLORS: from HSL to a pixel number
       ------------------------------------------------------ */

    // Converts an HSL color into a pixel (A-B-G-R number)
    function hslToPixel(h, s, l) {
        s /= 100;
        l /= 100;
        const k = (n) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
        const r = Math.round(f(0) * 255);
        const g = Math.round(f(8) * 255);
        const b = Math.round(f(4) * 255);
        // ">>> 0" keeps the number positive
        return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }

    // Picks the color of a new grain. Each grain is slightly lighter
    // or darker than the others, so it looks like real sand.
    function newGrainColor() {
        const variation = (Math.random() - 0.5) * 16;
        if (selectedColor.rainbow) {
            return hslToPixel(rainbowHue, 85, 60 + variation);
        }
        const c = selectedColor;
        const lightness = Math.max(5, Math.min(97, c.l + variation));
        return hslToPixel(c.h, c.s, lightness);
    }

    /* ------------------------------------------------------
       5. CANVAS SETUP (also when the window is resized)
       ------------------------------------------------------ */

    function setupCanvas() {
        // Size of the drawing area (the screen without the color bar)
        const width = sandArea.clientWidth;
        const height = sandArea.clientHeight;

        // On very large screens make the cells a little bigger,
        // so there aren't too many grains to compute.
        cellSize = Math.max(GRAIN_SIZE, Math.ceil(width / MAX_COLUMNS));

        // Smaller grains need more steps to fall just as fast
        stepsPerFrame = Math.max(1, Math.round(FALL_SPEED / cellSize));

        // Round down so the sand floor is fully visible
        const newColumns = Math.max(1, Math.floor(width / cellSize));
        const newRows = Math.max(1, Math.floor(height / cellSize));
        const newGrid = new Uint32Array(newColumns * newRows);

        // If there was sand already, move it into the new grid,
        // stuck to the bottom (where sand rests).
        if (grid) {
            const offset = newRows - rows;
            for (let y = 0; y < rows; y++) {
                const newY = y + offset;
                if (newY < 0 || newY >= newRows) continue;
                for (let x = 0; x < Math.min(columns, newColumns); x++) {
                    newGrid[newY * newColumns + x] = grid[y * columns + x];
                }
            }
        }

        columns = newColumns;
        rows = newRows;
        grid = newGrid;
        drift = new Int8Array(columns * rows); // moved grains have already landed

        // The canvas has one pixel per cell;
        // we stretch it to fill the whole drawing area.
        canvas.width = columns;
        canvas.height = rows;
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";

        image = context.createImageData(columns, rows);
        pixels = new Uint32Array(image.data.buffer);

        // New chunks: wake them all up at the start
        chunkColumns = Math.ceil(columns / CHUNK_SIZE);
        chunkRows = Math.ceil(rows / CHUNK_SIZE);
        awake = new Uint8Array(chunkColumns * chunkRows);
        awakeNext = new Uint8Array(chunkColumns * chunkRows).fill(1);
    }

    // Wakes up the chunks around cell (x, y), so that in the next step
    // the neighboring grains are updated too (for example the ones above,
    // which can now fall into the freed spot).
    function wakeUp(x, y) {
        const cx1 = Math.max(0, Math.floor((x - 1) / CHUNK_SIZE));
        const cx2 = Math.min(chunkColumns - 1, Math.floor((x + 1) / CHUNK_SIZE));
        const cy1 = Math.max(0, Math.floor((y - 1) / CHUNK_SIZE));
        const cy2 = Math.min(chunkRows - 1, Math.floor((y + 1) / CHUNK_SIZE));
        awakeNext[cy1 * chunkColumns + cx1] = 1;
        awakeNext[cy1 * chunkColumns + cx2] = 1;
        awakeNext[cy2 * chunkColumns + cx1] = 1;
        awakeNext[cy2 * chunkColumns + cx2] = 1;
    }

    /* ------------------------------------------------------
       6. FALLING SAND
       ------------------------------------------------------ */

    // Moves every grain at most once.
    // We go from bottom to top so a grain is never moved twice.
    function step() {
        // Chunks woken up in the previous step are the ones updated now
        const swap = awake;
        awake = awakeNext;
        awakeNext = swap;
        awakeNext.fill(0);

        // While draining, all chunks are awake
        // and the bottom row disappears: the grains "fall out"
        let sandLeft = false;
        if (draining) {
            awake.fill(1);
            const lastRow = (rows - 1) * columns;
            for (let x = 0; x < columns; x++) {
                if (grid[lastRow + x] !== 0) sandLeft = true;
                grid[lastRow + x] = 0;
            }
        }

        // Change the scanning direction each step,
        // otherwise the sand would always flow to the same side.
        const goRight = Math.random() < 0.5;

        for (let y = rows - 2; y >= 0; y--) {
            const row = y * columns;
            const rowBelow = row + columns;
            const chunkRow = Math.floor(y / CHUNK_SIZE) * chunkColumns;

            for (let i = 0; i < chunkColumns; i++) {
                const cx = goRight ? i : chunkColumns - 1 - i;
                if (awake[chunkRow + cx] === 0) continue; // chunk is asleep

                const start = cx * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, columns);

                for (let j = 0; j < end - start; j++) {
                    const x = goRight ? start + j : end - 1 - j;
                    const grain = grid[row + x];
                    if (grain === 0) continue; // empty cell

                    sandLeft = true;

                    const kick = drift[row + x];
                    let newX = -1;

                    if (grid[rowBelow + x] === 0) {
                        // 1. The cell below is free: the grain falls.
                        newX = x;

                        // Every now and then, while falling, it drifts a little
                        // toward its kick direction (or randomly, as jitter).
                        const chance = Math.abs(kick) / 10 * SPREAD + JITTER;
                        if (Math.random() < chance) {
                            let side = Math.sign(kick);
                            if (side === 0 || Math.random() < JITTER / chance) {
                                side = Math.random() < 0.5 ? -1 : 1;
                            }
                            const sideX = x + side;
                            if (sideX >= 0 && sideX < columns && grid[rowBelow + sideX] === 0) {
                                newX = sideX;
                            }
                        }
                    } else {
                        // 2. The cell below is taken: try to slide diagonally
                        // (the side is random, so the pile comes out nicely rounded).
                        const left = x > 0 && grid[rowBelow + x - 1] === 0;
                        const right = x < columns - 1 && grid[rowBelow + x + 1] === 0;
                        if (left && right) newX = Math.random() < 0.5 ? x - 1 : x + 1;
                        else if (left) newX = x - 1;
                        else if (right) newX = x + 1;
                    }

                    // 3. If it has nowhere to fall, the grain stops and loses its kick.
                    if (newX === -1) {
                        drift[row + x] = 0;
                        continue;
                    }

                    grid[rowBelow + newX] = grain;
                    grid[row + x] = 0;
                    drift[rowBelow + newX] = kick;
                    drift[row + x] = 0;
                    wakeUp(x, y);
                    wakeUp(newX, y + 1);
                }
            }
        }

        // When there are no grains left, draining is finished
        if (draining && !sandLeft) {
            draining = false;
        }
    }

    /* ------------------------------------------------------
       7. POURING SAND
       ------------------------------------------------------ */

    // Puts a grain into a cell, only if that cell is free
    function addGrain(x, y) {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || x >= columns || y < 0 || y >= rows) return;
        const index = y * columns + x;
        if (grid[index] === 0) {
            grid[index] = newGrainColor();
            // The grain's kick: a number between -10 and 10
            drift[index] = Math.round((Math.random() * 2 - 1) * 10);
            wakeUp(x, y);
        }
    }

    // For every finger on the screen, add grains around it.
    // If the finger moved fast, spread the grains along the whole path
    // so there are no gaps in the drawing.
    function pour() {
        if (pointers.size === 0) return;

        // Convert the stream width from screen pixels to cells
        const radius = STREAM_RADIUS / cellSize;
        const grains = Math.max(1, Math.round(STREAM_DENSITY * radius * radius));

        pointers.forEach((pointer) => {
            for (let n = 0; n < grains; n++) {
                // A random point on the path between the old and the new position
                const t = Math.random();
                const cx = pointer.prevX + (pointer.x - pointer.prevX) * t;
                const cy = pointer.prevY + (pointer.y - pointer.prevY) * t;

                // ...scattered a little inside a circle around it
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.sqrt(Math.random()) * radius;
                addGrain(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance);
            }
            pointer.prevX = pointer.x;
            pointer.prevY = pointer.y;
        });

        // In rainbow mode, the color slowly changes while pouring
        if (selectedColor.rainbow) {
            rainbowHue = (rainbowHue + RAINBOW_SPEED) % 360;
        }
    }

    /* ------------------------------------------------------
       8. DRAWING ON SCREEN
       ------------------------------------------------------ */

    function draw() {
        for (let i = 0; i < grid.length; i++) {
            pixels[i] = grid[i] || BACKGROUND_COLOR;
        }
        context.putImageData(image, 0, 0);
    }

    // Main loop: runs about 60 times per second
    function frame() {
        pour();
        for (let s = 0; s < stepsPerFrame; s++) {
            step();
        }
        draw();
        requestAnimationFrame(frame);
    }

    /* ------------------------------------------------------
       9. FINGERS AND MOUSE
       ------------------------------------------------------ */

    // Converts a screen position into a grid column and row
    function gridPosition(event) {
        const bounds = canvas.getBoundingClientRect();
        return {
            x: (event.clientX - bounds.left) / bounds.width * columns,
            y: (event.clientY - bounds.top) / bounds.height * rows
        };
    }

    canvas.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        const p = gridPosition(event);
        pointers.set(event.pointerId, { x: p.x, y: p.y, prevX: p.x, prevY: p.y });
        hint.classList.add("fade-out");
    });

    canvas.addEventListener("pointermove", (event) => {
        const pointer = pointers.get(event.pointerId);
        if (!pointer) return;
        const p = gridPosition(event);
        pointer.x = p.x;
        pointer.y = p.y;
    });

    function releasePointer(event) {
        pointers.delete(event.pointerId);
    }
    canvas.addEventListener("pointerup", releasePointer);
    canvas.addEventListener("pointercancel", releasePointer);
    canvas.addEventListener("lostpointercapture", releasePointer);

    // No menu on right-click or long press
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());

    /* ------------------------------------------------------
       10. BUTTONS
       ------------------------------------------------------ */

    // Create one round button for each color
    COLORS.forEach((color, index) => {
        const button = document.createElement("button");
        button.className = "button color";
        button.title = color.name;
        button.setAttribute("aria-label", color.name);
        button.setAttribute("role", "radio");

        if (color.rainbow) {
            button.classList.add("rainbow");
        } else {
            button.style.background = `hsl(${color.h}, ${color.s}%, ${color.l}%)`;
        }

        if (index === 0) {
            button.classList.add("active");
            button.setAttribute("aria-checked", "true");
        } else {
            button.setAttribute("aria-checked", "false");
        }

        button.addEventListener("click", () => {
            selectedColor = color;
            colorsContainer.querySelectorAll(".color").forEach((b) => {
                b.classList.remove("active");
                b.setAttribute("aria-checked", "false");
            });
            button.classList.add("active");
            button.setAttribute("aria-checked", "true");
        });

        colorsContainer.appendChild(button);
    });

    // Clearing: ask first, then let the sand flow out of the screen
    clearButton.addEventListener("click", () => {
        confirmDialog.classList.remove("hidden");
        noButton.focus();
    });

    yesButton.addEventListener("click", () => {
        confirmDialog.classList.add("hidden");
        draining = true;
    });

    noButton.addEventListener("click", () => {
        confirmDialog.classList.add("hidden");
    });

    // Tapping outside the dialog box closes it (same as "No")
    confirmDialog.addEventListener("click", (event) => {
        if (event.target === confirmDialog) confirmDialog.classList.add("hidden");
    });

    // Save the drawing as a PNG image
    saveButton.addEventListener("click", () => {
        // Make an enlarged copy of the drawing so the image isn't small and blurry
        const copy = document.createElement("canvas");
        copy.width = columns * cellSize;
        copy.height = rows * cellSize;
        const copyContext = copy.getContext("2d");
        copyContext.imageSmoothingEnabled = false;
        copyContext.drawImage(canvas, 0, 0, copy.width, copy.height);

        copy.toBlob((file) => {
            if (!file) return;
            const link = document.createElement("a");
            link.href = URL.createObjectURL(file);
            link.download = "tablou-din-nisip.png"; // file name the user sees
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(link.href), 2000);
        }, "image/png");
    });

    /* ------------------------------------------------------
       11. STARTUP
       ------------------------------------------------------ */

    // When the window is resized (or the tablet is rotated),
    // rebuild the grid — but wait a moment so it isn't rebuilt dozens of times.
    let resizeTimer = null;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(setupCanvas, 150);
    });

    setupCanvas();
    requestAnimationFrame(frame);
})();
