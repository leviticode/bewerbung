(() => {
    "use strict";

    /*
     * ==========================================================
     * PNG:
     * images/portrait.png
     *
     * Diese Version korrigiert die Vordergrund-Zahlen weiter:
     *
     * - keine grauen Spuren mehr
     * - Vordergrund-Zahlen liegen auf eigener Overlay-Ebene
     * - Wechsel zwischen 0 und 1 ohne Überlagerungs-Schmiereffekt
     * - Tempo und Sichtbarkeit des Wechsels sind leicht regulierbar
     * ==========================================================
     */

    const canvas = document.getElementById("matrixPortrait");
    const hud = document.getElementById("matrixHud");

    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });

    // Persistente Matrix-Ebene mit Nachleuchten
    const matrixCanvas = document.createElement("canvas");
    const matrixCtx = matrixCanvas.getContext("2d", { alpha: false });

    // Bild-Masken-Ebene
    const sourceCanvas = document.createElement("canvas");
    const sourceCtx = sourceCanvas.getContext("2d", {
        willReadFrequently: true
    });

    // Vordergrund-Overlay ohne Nachleuchten
    const frontCanvas = document.createElement("canvas");
    const frontCtx = frontCanvas.getContext("2d");

    const image = new Image();

    const CONFIG = {
        imagePath:
            canvas.dataset.portrait || "images/portrait.png",


// Sichtbare Glyphengröße
glyphSizeDesktop: 7,
glyphSizeMobile: 7,

/*
 * Zusätzliche horizontale Abdeckung.
 * 1.0 = nur die normalen Glyph-Spalten
 * 2.0 = doppelte horizontale Lane-Auflösung
 * 3.0 = dreifache horizontale Lane-Auflösung
 */
laneDensityDesktop: 1.0,
laneDensityMobile: 1.0,

/*
 * Zielmenge der Streams relativ zur Lane-Anzahl.
 * 1.0 = ungefähr ein Stream pro Lane
 */
streamDensityDesktop: 5.0,
streamDensityMobile: 5.0,

/*
 * Garantierte Grundabdeckung pro Lane.
 */
coverageStreamsPerLaneDesktop: 5,
coverageStreamsPerLaneMobile: 5,

/*
 * Harte Obergrenze pro Lane.
 * 1 = keine Lane bekommt mehr als einen Stream
 */
maxStreamsPerLaneDesktop: 10,
maxStreamsPerLaneMobile: 10,

/*
 * Trotzdem behalten wir einen separaten Schutz gegen
 * Überladung innerhalb derselben Bild-/Maskenspalte.
 */
maxLaneHitsPerMaskColumnDesktop: 10,
maxLaneHitsPerMaskColumnMobile: 10,

/*
 * Zusatzstreams bevorzugen Bereiche des Motivs.
 */
portraitStreamBias: 200,

/*
 * Nur sehr kleiner Jitter, damit Zwischen-Lanes nicht
 * wieder unnötig Löcher erzeugen.
 */
horizontalJitter: 0.05,

// Vertikaler Abstand innerhalb eines Streams
verticalSpacingMin: 0.40,
verticalSpacingMax: 0.80,

// Größe des Porträts
portraitScale: 0.84,

// Maskenparameter
contrast: 2.35,
gamma: 0.84,
minimumMask: 0.025,

// Bewegungsgefühl
fadeAlpha: 0.020,
baseAlpha: 0.052,
portraitAlphaBoost: 0.9,
portraitSlowdown: 0.50,

// Matrix-Streams
rainLengthMin: 30,
rainLengthMax: 70,
rainSpeedMin: 2.5,
rainSpeedMax: 3.0,
changeChance: 0.016,

        /*
         * ------------------------------------------------------
         * Vordergrund-Zahlen / Tiefen-Ebene
         * ------------------------------------------------------
         */
        frontFloatEnabled: true,
        frontFloatCountDesktop: 18,
        frontFloatCountMobile: 9,

        frontFloatBaseSizeDesktop: 18,
        frontFloatBaseSizeMobile: 14,

        frontFloatMinScale: 0.35,
        frontFloatMaxScale: 2.10,

        frontFloatLifeMin: 140,
        frontFloatLifeMax: 250,

        /*
         * WIE OFT startet ein Wechsel zwischen 0 und 1?
         * Höher = häufiger.
         */
        frontFloatSwitchChance: 0.028,

        /*
         * WIE SCHNELL läuft ein einzelner Wechsel ab?
         * Niedriger = schnellerer Wechsel.
         */
        frontFloatSwitchFramesMin: 5,
        frontFloatSwitchFramesMax: 10,

        /*
         * WIE STARK wird beim Wechsel die Sichtbarkeit abgesenkt?
         * 0.00 = in der Mitte fast unsichtbar (sauberer, härterer Wechsel)
         * 0.30 = in der Mitte noch deutlich sichtbar
         */
        frontFloatSwitchMidAlpha: 0.05,

        /*
         * Glow während des Wechsels separat regelbar.
         * Weniger = weniger "Geisterbild" beim Umschalten.
         */
        frontFloatSwitchGlowFactor: 0.2,

        // Allgemeine Sichtbarkeit der Vordergrund-Zahlen
        frontFloatMaxAlpha: 0.20,
        frontFloatGlow: 0.20,

        // Randabstand für Spawn-Positionen
        frontFloatSpawnMargin: 0.03,

        showHud: true,

        characters: "01"
    };

    const state = {
        width: 1,
        height: 1,
        dpr: 1,

        glyphSize: 12,
        laneStep: 12,

        maskColumns: 1,
        lanes: 1,
        rows: 1,
        frame: 0,

        imageLoaded: false,
        visibleMaskCells: 0,
        drawWidth: 0,
        drawHeight: 0,

        mask: new Float32Array(0),

        portraitMaskColumns: [],
        portraitLanes: [],

        streams: [],

        laneLoad: new Uint8Array(0),
        maskColumnLoad: new Uint8Array(0),
        frameLaneOccupancy: new Uint8Array(0),

        frontFloatBaseSize: 18,
        frontFloats: [],

        resizeTimer: 0
    };

    const CHARS = CONFIG.characters;
    const CHAR_COUNT = CHARS.length;

    function randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    }

    function randomInt(min, max) {
        return Math.floor(randomBetween(min, max + 1));
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function randomCharIndex() {
        return Math.floor(Math.random() * CHAR_COUNT);
    }

    function charAtIndex(index) {
        return CHARS[index % CHAR_COUNT];
    }

    function luminance(r, g, b, a) {
        return (
            (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255
        ) * (a / 255);
    }

    function isMobileLayout() {
        return window.innerWidth <= 700;
    }

    function activeLaneDensity() {
        return isMobileLayout()
            ? CONFIG.laneDensityMobile
            : CONFIG.laneDensityDesktop;
    }

    function activeStreamDensity() {
        return isMobileLayout()
            ? CONFIG.streamDensityMobile
            : CONFIG.streamDensityDesktop;
    }

    function activeCoverageStreamsPerLane() {
        return isMobileLayout()
            ? CONFIG.coverageStreamsPerLaneMobile
            : CONFIG.coverageStreamsPerLaneDesktop;
    }

    function activeMaxStreamsPerLane() {
        return isMobileLayout()
            ? CONFIG.maxStreamsPerLaneMobile
            : CONFIG.maxStreamsPerLaneDesktop;
    }

    function activeMaxLaneHitsPerMaskColumn() {
        return isMobileLayout()
            ? CONFIG.maxLaneHitsPerMaskColumnMobile
            : CONFIG.maxLaneHitsPerMaskColumnDesktop;
    }

    function activeFrontFloatCount() {
        return isMobileLayout()
            ? CONFIG.frontFloatCountMobile
            : CONFIG.frontFloatCountDesktop;
    }

    function activeFrontFloatBaseSize() {
        return isMobileLayout()
            ? CONFIG.frontFloatBaseSizeMobile
            : CONFIG.frontFloatBaseSizeDesktop;
    }

    function laneCenterX(laneIndex) {
        return laneIndex * state.laneStep + state.laneStep / 2;
    }

    function laneToMaskColumn(laneIndex) {
        const x = laneCenterX(laneIndex);
        return clamp(
            Math.floor(x / state.glyphSize),
            0,
            state.maskColumns - 1
        );
    }

    function brightnessAtPosition(x, row) {
        if (
            row < 0 ||
            row >= state.rows ||
            state.mask.length === 0
        ) {
            return 0;
        }

        const leftColumn = clamp(
            Math.floor(x / state.glyphSize),
            0,
            state.maskColumns - 1
        );

        const rightColumn = clamp(
            leftColumn + 1,
            0,
            state.maskColumns - 1
        );

        const columnLocalX =
            (x - leftColumn * state.glyphSize) /
            Math.max(1, state.glyphSize);

        const leftValue =
            state.mask[row * state.maskColumns + leftColumn];

        const rightValue =
            state.mask[row * state.maskColumns + rightColumn];

        return leftValue * (1 - columnLocalX) +
               rightValue * columnLocalX;
    }

    function updateHud(extra = "") {
        if (!CONFIG.showHud) {
            hud.style.display = "none";
            return;
        }

        const lines = [
            `Bildpfad: ${CONFIG.imagePath}`,
            `Bild geladen: ${state.imageLoaded ? "Ja" : "Nein"}`,
            `Maskenraster: ${state.maskColumns} × ${state.rows}`,
            `Lanes: ${state.lanes}`,
            `Glyph-Größe: ${Math.round(state.glyphSize / state.dpr)}px`,
            `Lane-Abstand: ${Math.round((state.laneStep / state.dpr) * 100) / 100}px`,
            `Matrix-Streams: ${state.streams.length}`,
            `Front-Floats: ${state.frontFloats.length}`,
            `Lane-Density: ${activeLaneDensity().toFixed(2)}×`,
            `Stream-Density: ${activeStreamDensity().toFixed(2)}×`,
            `Switch-Chance: ${CONFIG.frontFloatSwitchChance}`,
            `Switch-Frames: ${CONFIG.frontFloatSwitchFramesMin}-${CONFIG.frontFloatSwitchFramesMax}`,
            `Sichtbare Maskenzellen: ${state.visibleMaskCells}`
        ];

        if (state.drawWidth && state.drawHeight) {
            lines.push(
                `Bildbereich: ${Math.round(state.drawWidth / state.dpr)} × ${Math.round(state.drawHeight / state.dpr)} CSS-Pixel`
            );
        }

        if (extra) {
            lines.push("");
            lines.push(extra);
        }

        hud.textContent = lines.join("\n");
    }

    function resizeCanvas() {
        const cssWidth = Math.max(1, window.innerWidth);
        const cssHeight = Math.max(1, window.innerHeight);

        state.dpr = Math.min(window.devicePixelRatio || 1, 2);
        state.width = Math.floor(cssWidth * state.dpr);
        state.height = Math.floor(cssHeight * state.dpr);

        canvas.width = state.width;
        canvas.height = state.height;

        matrixCanvas.width = state.width;
        matrixCanvas.height = state.height;

        sourceCanvas.width = state.width;
        sourceCanvas.height = state.height;

        frontCanvas.width = state.width;
        frontCanvas.height = state.height;

        state.glyphSize =
            (isMobileLayout()
                ? CONFIG.glyphSizeMobile
                : CONFIG.glyphSizeDesktop) * state.dpr;

        state.frontFloatBaseSize =
            activeFrontFloatBaseSize() * state.dpr;

        state.maskColumns = Math.ceil(
            state.width / state.glyphSize
        );

        state.rows = Math.ceil(
            state.height / state.glyphSize
        );

        const laneDensity = activeLaneDensity();
        state.laneStep = state.glyphSize / laneDensity;
        state.lanes = Math.ceil(
            state.width / state.laneStep
        );

        state.frameLaneOccupancy = new Uint8Array(
            state.lanes * state.rows
        );

        if (state.imageLoaded) {
            buildMaskFromImage(false);
        } else {
            state.mask = new Float32Array(
                state.maskColumns * state.rows
            );
            state.visibleMaskCells = 0;
            state.portraitMaskColumns = [];
            state.portraitLanes = [];
        }

        buildStreams();
        buildFrontFloats();

        matrixCtx.fillStyle = "#000";
        matrixCtx.fillRect(0, 0, state.width, state.height);

        frontCtx.clearRect(0, 0, state.width, state.height);

        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, state.width, state.height);

        updateHud();
    }

    function findOpaqueBounds() {
        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d", {
            willReadFrequently: true
        });

        tempCanvas.width = image.naturalWidth;
        tempCanvas.height = image.naturalHeight;

        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(image, 0, 0);

        const pixels = tempCtx.getImageData(
            0,
            0,
            tempCanvas.width,
            tempCanvas.height
        ).data;

        let minX = tempCanvas.width;
        let minY = tempCanvas.height;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < tempCanvas.height; y++) {
            for (let x = 0; x < tempCanvas.width; x++) {
                const index = (y * tempCanvas.width + x) * 4;

                if (pixels[index + 3] > 8) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (maxX < 0 || maxY < 0) {
            return {
                sx: 0,
                sy: 0,
                sw: image.naturalWidth,
                sh: image.naturalHeight
            };
        }

        return {
            sx: minX,
            sy: minY,
            sw: maxX - minX + 1,
            sh: maxY - minY + 1
        };
    }

    function drawImageFitted() {
        sourceCtx.clearRect(0, 0, state.width, state.height);
        sourceCtx.fillStyle = "#000";
        sourceCtx.fillRect(0, 0, state.width, state.height);

        const bounds = findOpaqueBounds();
        const sourceRatio = bounds.sw / bounds.sh;

        const maxWidth = state.width * CONFIG.portraitScale;
        const maxHeight = state.height * CONFIG.portraitScale;
        const targetRatio = maxWidth / maxHeight;

        let drawWidth;
        let drawHeight;

        if (sourceRatio > targetRatio) {
            drawWidth = maxWidth;
            drawHeight = drawWidth / sourceRatio;
        } else {
            drawHeight = maxHeight;
            drawWidth = drawHeight * sourceRatio;
        }

        const dx = (state.width - drawWidth) / 2;
        const dy = (state.height - drawHeight) / 2;

        sourceCtx.drawImage(
            image,
            bounds.sx,
            bounds.sy,
            bounds.sw,
            bounds.sh,
            dx,
            dy,
            drawWidth,
            drawHeight
        );

        state.drawWidth = drawWidth;
        state.drawHeight = drawHeight;
    }

    function buildMaskFromImage(rebuildStreams = true) {
        drawImageFitted();

        const pixels = sourceCtx.getImageData(
            0,
            0,
            state.width,
            state.height
        ).data;

        const mask = new Float32Array(
            state.maskColumns * state.rows
        );

        const visibleMaskColumns = new Set();
        let visibleCount = 0;

        const samplePoints = [
            [0.18, 0.18],
            [0.50, 0.18],
            [0.82, 0.18],
            [0.18, 0.50],
            [0.50, 0.50],
            [0.82, 0.50],
            [0.18, 0.82],
            [0.50, 0.82],
            [0.82, 0.82]
        ];

        for (let row = 0; row < state.rows; row++) {
            for (let column = 0; column < state.maskColumns; column++) {
                const x0 = Math.floor(column * state.glyphSize);
                const y0 = Math.floor(row * state.glyphSize);

                let value = 0;

                for (const [sx, sy] of samplePoints) {
                    const px = clamp(
                        Math.floor(x0 + state.glyphSize * sx),
                        0,
                        state.width - 1
                    );

                    const py = clamp(
                        Math.floor(y0 + state.glyphSize * sy),
                        0,
                        state.height - 1
                    );

                    const index = (py * state.width + px) * 4;

                    value += luminance(
                        pixels[index],
                        pixels[index + 1],
                        pixels[index + 2],
                        pixels[index + 3]
                    );
                }

                value /= samplePoints.length;
                value = clamp(value * CONFIG.contrast, 0, 1);
                value = Math.pow(value, CONFIG.gamma);

                const maskIndex = row * state.maskColumns + column;
                mask[maskIndex] = value;

                if (value >= CONFIG.minimumMask) {
                    visibleCount++;
                    visibleMaskColumns.add(column);
                }
            }
        }

        state.mask = mask;
        state.visibleMaskCells = visibleCount;
        state.portraitMaskColumns = Array.from(visibleMaskColumns);

        const portraitLanes = [];
        for (let lane = 0; lane < state.lanes; lane++) {
            const column = laneToMaskColumn(lane);
            if (visibleMaskColumns.has(column)) {
                portraitLanes.push(lane);
            }
        }
        state.portraitLanes = portraitLanes;

        if (rebuildStreams) {
            buildStreams();
        }

        updateHud("Bild erfolgreich geladen.");
    }

    function getRandomLane() {
        if (
            state.portraitLanes.length > 0 &&
            Math.random() < CONFIG.portraitStreamBias
        ) {
            return state.portraitLanes[
                randomInt(0, state.portraitLanes.length - 1)
            ];
        }

        return randomInt(0, state.lanes - 1);
    }

    function pickAvailableLane(laneLoadArray, maskColumnLoadArray) {
        const maxPerLane = activeMaxStreamsPerLane();
        const maxPerMaskColumn = activeMaxLaneHitsPerMaskColumn();

        for (let attempt = 0; attempt < 42; attempt++) {
            const lane = getRandomLane();
            const maskColumn = laneToMaskColumn(lane);

            if (
                laneLoadArray[lane] < maxPerLane &&
                maskColumnLoadArray[maskColumn] < maxPerMaskColumn
            ) {
                return lane;
            }
        }

        let bestLane = -1;
        let bestScore = Infinity;

        for (let lane = 0; lane < state.lanes; lane++) {
            const maskColumn = laneToMaskColumn(lane);

            if (
                laneLoadArray[lane] >= maxPerLane ||
                maskColumnLoadArray[maskColumn] >= maxPerMaskColumn
            ) {
                continue;
            }

            const score =
                laneLoadArray[lane] * 10 +
                maskColumnLoadArray[maskColumn];

            if (score < bestScore) {
                bestScore = score;
                bestLane = lane;
            }
        }

        return bestLane;
    }

    function createStream(laneIndex, coverageIndex = null) {
        const chars = new Uint8Array(
            CONFIG.rainLengthMax + 12
        );

        for (let i = 0; i < chars.length; i++) {
            chars[i] = randomCharIndex();
        }

        let startY;

        if (coverageIndex === null) {
            startY = randomBetween(
                -state.height * 1.0,
                state.height * 1.0
            );
        } else {
            const coverageCount = Math.max(
                1,
                activeCoverageStreamsPerLane()
            );

            startY =
                (coverageIndex / coverageCount) * state.height +
                randomBetween(
                    -state.height * 0.20,
                    state.height * 0.20
                );
        }

        const laneCenter = laneCenterX(laneIndex);
        const x = clamp(
            laneCenter +
                randomBetween(
                    -state.laneStep * CONFIG.horizontalJitter,
                    state.laneStep * CONFIG.horizontalJitter
                ),
            state.glyphSize * 0.35,
            state.width - state.glyphSize * 0.35
        );

        return {
            lane: laneIndex,
            x,
            y: startY,
            speed:
                randomBetween(
                    CONFIG.rainSpeedMin,
                    CONFIG.rainSpeedMax
                ) *
                state.glyphSize *
                randomBetween(0.22, 0.29),
            length: randomInt(
                CONFIG.rainLengthMin,
                CONFIG.rainLengthMax
            ),
            spacing: randomBetween(
                CONFIG.verticalSpacingMin,
                CONFIG.verticalSpacingMax
            ),
            chars
        };
    }

    function buildStreams() {
        const density = activeStreamDensity();
        const coveragePerLane = Math.min(
            Math.max(1, activeCoverageStreamsPerLane()),
            activeMaxStreamsPerLane()
        );

        const minimumCount = state.lanes * coveragePerLane;
        const requestedCount = Math.ceil(state.lanes * density);

        const maximumCount = Math.min(
            state.lanes * activeMaxStreamsPerLane(),
            state.maskColumns * activeMaxLaneHitsPerMaskColumn()
        );

        const totalCount = Math.min(
            Math.max(minimumCount, requestedCount),
            maximumCount
        );

        const laneLoad = new Uint8Array(state.lanes);
        const maskColumnLoad = new Uint8Array(state.maskColumns);
        const streams = [];

        for (let lane = 0; lane < state.lanes; lane++) {
            for (let coverageIndex = 0; coverageIndex < coveragePerLane; coverageIndex++) {
                const maskColumn = laneToMaskColumn(lane);

                if (
                    laneLoad[lane] >= activeMaxStreamsPerLane() ||
                    maskColumnLoad[maskColumn] >= activeMaxLaneHitsPerMaskColumn()
                ) {
                    continue;
                }

                streams.push(createStream(lane, coverageIndex));
                laneLoad[lane]++;
                maskColumnLoad[maskColumn]++;
            }
        }

        while (streams.length < totalCount) {
            const lane = pickAvailableLane(laneLoad, maskColumnLoad);

            if (lane < 0) break;

            const maskColumn = laneToMaskColumn(lane);
            streams.push(createStream(lane, null));
            laneLoad[lane]++;
            maskColumnLoad[maskColumn]++;
        }

        for (let i = streams.length - 1; i > 0; i--) {
            const j = randomInt(0, i);
            [streams[i], streams[j]] = [streams[j], streams[i]];
        }

        state.streams = streams;
        state.laneLoad = laneLoad;
        state.maskColumnLoad = maskColumnLoad;

        updateHud();
    }

    function createFrontFloat() {
        const marginX = state.width * CONFIG.frontFloatSpawnMargin;
        const marginY = state.height * CONFIG.frontFloatSpawnMargin;

        const lifetime = randomInt(
            CONFIG.frontFloatLifeMin,
            CONFIG.frontFloatLifeMax
        );

        return {
            char: Math.random() < 0.5 ? "0" : "1",
            x: randomBetween(marginX, state.width - marginX),
            y: randomBetween(marginY, state.height - marginY),
            age: randomBetween(0, lifetime * 0.95),
            life: lifetime,
            scaleJitter: randomBetween(0.90, 1.14),
            glowJitter: randomBetween(0.85, 1.15),

            switching: false,
            switchAge: 0,
            switchDuration: randomInt(
                CONFIG.frontFloatSwitchFramesMin,
                CONFIG.frontFloatSwitchFramesMax
            ),
            nextChar: null
        };
    }

    function buildFrontFloats() {
        if (!CONFIG.frontFloatEnabled) {
            state.frontFloats = [];
            return;
        }

        const count = activeFrontFloatCount();
        state.frontFloats = Array.from(
            { length: count },
            () => createFrontFloat()
        );
    }

    function resetFrontFloat(frontFloat) {
        const fresh = createFrontFloat();
        frontFloat.char = fresh.char;
        frontFloat.x = fresh.x;
        frontFloat.y = fresh.y;
        frontFloat.age = 0;
        frontFloat.life = fresh.life;
        frontFloat.scaleJitter = fresh.scaleJitter;
        frontFloat.glowJitter = fresh.glowJitter;
        frontFloat.switching = false;
        frontFloat.switchAge = 0;
        frontFloat.switchDuration = fresh.switchDuration;
        frontFloat.nextChar = null;
    }

    function beginFrontFloatSwitch(frontFloat) {
        if (frontFloat.switching) return;

        frontFloat.switching = true;
        frontFloat.switchAge = 0;
        frontFloat.switchDuration = randomInt(
            CONFIG.frontFloatSwitchFramesMin,
            CONFIG.frontFloatSwitchFramesMax
        );
        frontFloat.nextChar = frontFloat.char === "0" ? "1" : "0";
    }

    function switchAlphaMultiplier(progress) {
        // progress: 0..1
        // In der Mitte wird alpha abgesenkt, damit kein "doppeltes" Zeichen wirkt.
        const dip = clamp(CONFIG.frontFloatSwitchMidAlpha, 0, 1);
        const distance = Math.abs(progress * 2 - 1); // 1 an Rändern, 0 in der Mitte
        return dip + (1 - dip) * distance;
    }

    function updateAndDrawFrontFloats() {
        if (!CONFIG.frontFloatEnabled || state.frontFloats.length === 0) {
            return;
        }

        // Komplett leeren -> KEIN Nachleuchten
        frontCtx.clearRect(0, 0, state.width, state.height);
        frontCtx.textAlign = "center";
        frontCtx.textBaseline = "middle";

        for (const frontFloat of state.frontFloats) {
            frontFloat.age += 1;

            if (
                !frontFloat.switching &&
                Math.random() < CONFIG.frontFloatSwitchChance
            ) {
                beginFrontFloatSwitch(frontFloat);
            }

            let displayChar = frontFloat.char;
            let switchMultiplier = 1;

            if (frontFloat.switching) {
                frontFloat.switchAge += 1;

                const progress = clamp(
                    frontFloat.switchAge / frontFloat.switchDuration,
                    0,
                    1
                );

                switchMultiplier = switchAlphaMultiplier(progress);

                if (progress >= 0.5 && frontFloat.nextChar) {
                    displayChar = frontFloat.nextChar;
                }

                if (progress >= 1) {
                    frontFloat.char = frontFloat.nextChar;
                    frontFloat.nextChar = null;
                    frontFloat.switching = false;
                    frontFloat.switchAge = 0;
                    frontFloat.switchDuration = randomInt(
                        CONFIG.frontFloatSwitchFramesMin,
                        CONFIG.frontFloatSwitchFramesMax
                    );
                    displayChar = frontFloat.char;
                    switchMultiplier = 1;
                }
            }

            if (frontFloat.age >= frontFloat.life) {
                resetFrontFloat(frontFloat);
            }

            const t = clamp(frontFloat.age / frontFloat.life, 0, 1);

            const scale =
                (
                    CONFIG.frontFloatMinScale +
                    (CONFIG.frontFloatMaxScale - CONFIG.frontFloatMinScale) *
                    t
                ) * frontFloat.scaleJitter;

            const size = state.frontFloatBaseSize * scale;

            let alpha;
            if (t < 0.14) {
                alpha = (t / 0.14) * CONFIG.frontFloatMaxAlpha;
            } else if (t < 0.78) {
                alpha = CONFIG.frontFloatMaxAlpha;
            } else {
                alpha =
                    (1 - (t - 0.78) / 0.22) *
                    CONFIG.frontFloatMaxAlpha;
            }

            alpha = clamp(
                alpha * switchMultiplier,
                0,
                CONFIG.frontFloatMaxAlpha
            );

            if (alpha < 0.01) {
                continue;
            }

            frontCtx.save();
            frontCtx.translate(frontFloat.x, frontFloat.y);
            frontCtx.font = `700 ${size}px monospace`;

            const glowFactor = frontFloat.switching
                ? CONFIG.frontFloatSwitchGlowFactor
                : 1;

            if (t > 0.70) {
                frontCtx.fillStyle = `rgba(228,255,236,${alpha})`;
                frontCtx.shadowColor = "#86ffaf";
                frontCtx.shadowBlur =
                    size *
                    CONFIG.frontFloatGlow *
                    glowFactor *
                    frontFloat.glowJitter;
            } else {
                const green = Math.floor(142 + 56 * t);
                frontCtx.fillStyle = `rgba(0,${green},58,${alpha})`;
                frontCtx.shadowColor = "#00ff66";
                frontCtx.shadowBlur =
                    size *
                    CONFIG.frontFloatGlow *
                    0.52 *
                    glowFactor *
                    frontFloat.glowJitter;
            }

            frontCtx.fillText(displayChar, 0, 0);
            frontCtx.restore();
        }

        frontCtx.shadowBlur = 0;
    }

    function randomizeStream(stream) {
        stream.y = randomBetween(
            -state.height * 0.85,
            -state.glyphSize
        );

        stream.speed =
            randomBetween(
                CONFIG.rainSpeedMin,
                CONFIG.rainSpeedMax
            ) *
            state.glyphSize *
            randomBetween(0.22, 0.29);

        stream.length = randomInt(
            CONFIG.rainLengthMin,
            CONFIG.rainLengthMax
        );

        stream.spacing = randomBetween(
            CONFIG.verticalSpacingMin,
            CONFIG.verticalSpacingMax
        );

        const laneCenter = laneCenterX(stream.lane);
        stream.x = clamp(
            laneCenter +
                randomBetween(
                    -state.laneStep * CONFIG.horizontalJitter,
                    state.laneStep * CONFIG.horizontalJitter
                ),
            state.glyphSize * 0.35,
            state.width - state.glyphSize * 0.35
        );
    }

    function drawStream(stream) {
        const maskColumn = laneToMaskColumn(stream.lane);
        const laneLoad = state.laneLoad[stream.lane] || 1;
        const maskLoad = state.maskColumnLoad[maskColumn] || 1;

        const overlapDamping =
            1 / Math.sqrt(Math.max(laneLoad, maskLoad));

        for (let i = 0; i < stream.length; i++) {
            const y =
                stream.y -
                i * state.glyphSize * stream.spacing;

            const row = Math.floor(y / state.glyphSize);

            if (row < 0 || row >= state.rows) {
                continue;
            }

            const occupancyIndex =
                row * state.lanes + stream.lane;

            if (state.frameLaneOccupancy[occupancyIndex] !== 0) {
                continue;
            }

            if (Math.random() < CONFIG.changeChance) {
                stream.chars[i] = randomCharIndex();
            }

            const trail = 1 - i / stream.length;
            const brightness = brightnessAtPosition(stream.x, row);
            const inPortrait = brightness >= CONFIG.minimumMask;

            let alpha =
                CONFIG.baseAlpha * trail * overlapDamping;

            let fillStyle =
                `rgba(0,145,55,${alpha})`;

            let shadowColor = "transparent";
            let shadowBlur = 0;

            if (inPortrait) {
                alpha = clamp(
                    (
                        0.08 +
                        brightness * CONFIG.portraitAlphaBoost
                    ) *
                    trail *
                    overlapDamping,
                    0,
                    0.88
                );

                if (i === 0 && brightness > 0.56) {
                    fillStyle =
                        `rgba(225,255,234,${clamp(alpha + 0.05, 0, 0.92)})`;
                    shadowColor = "#7dffa2";
                    shadowBlur = state.glyphSize * 0.18;
                } else {
                    const green = Math.floor(
                        118 + brightness * 118
                    );
                    fillStyle =
                        `rgba(0,${green},45,${alpha})`;
                }
            } else if (i === 0) {
                alpha = clamp(
                    CONFIG.baseAlpha * 1.7 * overlapDamping,
                    0,
                    0.22
                );
                fillStyle =
                    `rgba(190,255,210,${alpha})`;
                shadowColor = "#63ff8c";
                shadowBlur = state.glyphSize * 0.10;
            }

            if (alpha < 0.012) {
                continue;
            }

            state.frameLaneOccupancy[occupancyIndex] = 1;

            matrixCtx.fillStyle = fillStyle;
            matrixCtx.shadowColor = shadowColor;
            matrixCtx.shadowBlur = shadowBlur;

            matrixCtx.fillText(
                charAtIndex(stream.chars[i]),
                stream.x,
                y
            );
        }

        const headRow = Math.floor(stream.y / state.glyphSize);
        const headBrightness =
            brightnessAtPosition(stream.x, headRow);

        const speedFactor = clamp(
            1 - headBrightness * CONFIG.portraitSlowdown,
            0.34,
            1
        );

        stream.y += stream.speed * speedFactor;

        const trailHeight =
            stream.length *
            state.glyphSize *
            stream.spacing;

        if (stream.y - trailHeight > state.height) {
            randomizeStream(stream);
        }
    }

    function animate() {
        state.frame++;
        state.frameLaneOccupancy.fill(0);

        // Matrix-Ebene mit Nachleuchten
        matrixCtx.fillStyle = `rgba(0,0,0,${CONFIG.fadeAlpha})`;
        matrixCtx.fillRect(0, 0, state.width, state.height);

        matrixCtx.textAlign = "center";
        matrixCtx.textBaseline = "middle";
        matrixCtx.font = `600 ${state.glyphSize}px monospace`;

        for (const stream of state.streams) {
            drawStream(stream);
        }

        // Vordergrund-Ebene ohne Nachleuchten
        updateAndDrawFrontFloats();

        // Sichtbares Bild zusammensetzen
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, state.width, state.height);
        ctx.drawImage(matrixCanvas, 0, 0);
        if (CONFIG.frontFloatEnabled) {
            ctx.drawImage(frontCanvas, 0, 0);
        }

        ctx.shadowBlur = 0;
        requestAnimationFrame(animate);
    }

    image.addEventListener("load", () => {
        state.imageLoaded = true;
        buildMaskFromImage(true);
        console.info("[Matrix SwitchFix] Bild geladen:", CONFIG.imagePath);
    });

    image.addEventListener("error", () => {
        state.imageLoaded = false;
        state.visibleMaskCells = 0;
        state.mask = new Float32Array(
            state.maskColumns * state.rows
        );
        state.portraitMaskColumns = [];
        state.portraitLanes = [];
        updateHud(
            "Fehler: portrait.png konnte nicht geladen werden."
        );
        console.error("[Matrix SwitchFix] Bild konnte nicht geladen werden:", CONFIG.imagePath);
    });

    window.addEventListener("resize", () => {
        clearTimeout(state.resizeTimer);
        state.resizeTimer = setTimeout(resizeCanvas, 120);
    });

    resizeCanvas();
    image.src =
        new URL(CONFIG.imagePath, document.baseURI).href +
        "?v=" +
        Date.now();
    animate();
})();
