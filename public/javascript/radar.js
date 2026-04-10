const DEFAULTS = {
    twcApiKey: "e1f10a1e78da46f5b10a1e78da96f525",
    mapboxToken: "pk.eyJ1IjoicGV5dG9ud2R5bSIsImEiOiJjbGx0NHpmMHYwenJtM2tsaXRmaHF3ZHBsIn0.TlyGx6b0mqYSbzZUFjIQmg",
    mapStyle: "mapbox://styles/peytonwdym/clov0gd3u00mj01pe1wmhb2j5",
    product: "twcRadarHcMosaic",
    totalFrames: 48,
    frameDelay: 150,
    loopGap: 1000,
    maxLoops: 12,
    maxTTL: 6,
    flyDuration: 2500,
    labelTextSize: 40,
    radarOpacity: 0.75,
};

const log = () => `[radar.js] | ${new Date().toLocaleString()} |`;

const formatTime = (ts) => {
    const d = new Date(ts * 1000);
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m < 10 ? "0" + m : m} ${ampm}`;
};

async function fetchTimeslices(apiKey, totalFrames, product = "twcRadarHcMosaic") {
    const res = await fetch(
        `https://api.weather.com/v3/TileServer/series/productSet/PPAcore?apiKey=${apiKey}`
    );
    if (!res.ok) throw new Error(`Timeslice fetch failed: ${res.status}`);
    const data = await res.json();

    const products = {
        "radar": "radar",
        "twcRadarHcMosaic": "radar",
        "twcRadarMosaic": "radar",
        "satrad": "satrad",
    }
    return data.seriesInfo[products[product]].series.reverse().slice(0, totalFrames);
}

export class RadarMap {
    #map = null;
    #slices = [];
    #frame = 0;
    #loops = 0;
    #ttl = 0;
    #animTimer = null;
    #loopTimer = null;
    #preloaded = false;
    #preloadPromise = null;
    #containerId;
    #timeEl;
    #onFrame;
    #opts;

    constructor(containerId, options = {}) {
        this.#containerId = containerId;
        this.#opts = { ...DEFAULTS, ...options };
        this.#timeEl = options.timeElement ?? null;
        this.#onFrame = options.onFrame ?? null;
    }

    get map() { return this.#map; }
    get isActive() { return this.#map !== null; }
    get ttl() { return this.#ttl; }

    async init(lat, lon, zoom, product) {
        product = product ?? this.#opts.product;

        if (!lat || !lon) {
            console.warn(log(), "Invalid coordinates");
            return;
        }

        const center = [lon, lat];

        if (this.#map) {
            if (this.#ttl >= this.#opts.maxTTL) {
                this.destroy();
                return this.init(lat, lon, zoom, product);
            }
            this.#map.setCenter(center);
            this.#map.setZoom(zoom);
            this.#ttl++;
            return this.#loadAndAnimate(product);
        }

        this.#map = new mapboxgl.Map({
            container: this.#containerId,
            style: this.#opts.mapStyle,
            center,
            accessToken: this.#opts.mapboxToken,
            telemetry: false,
            interactive: false,
            zoom,
            attributionControl: false,
            preserveDrawingBuffer: false,
        });

        await new Promise((resolve) => {
            this.#map.once("load", () => {
                this.#map.getStyle().layers.forEach((layer) => {
                    if (layer.type === "symbol" && layer.layout?.["text-size"]) {
                        this.#map.setLayoutProperty(layer.id, "text-size", this.#opts.labelTextSize);
                    }
                });
                try {
                    this.#map.setLayoutProperty("road-number-shield-navigation", "text-size", 18);
                } catch (_) {}
                resolve();
            });
        });

        await this.#loadAndAnimate(product);
    }

    async flyTo(lat, lon, zoom, product) {
        if (!this.#map) return;

        this.#loops = 0;

        this.#map.flyTo({
            center: [lon, lat],
            zoom,
            duration: this.#opts.flyDuration,
            essential: true,
        });

        await new Promise((resolve) => this.#map.once("moveend", resolve));
        this.#ttl++;
    }

    async preload(product) {
        product = product ?? this.#opts.product;
        if (this.#preloaded) return;
        try {
            await this.#fetchSlices(product);
            console.log(log(), `Radar preloaded for [${this.#containerId}]`);
        } catch (err) {
            console.error(log(), "Preload failed:", err.message);
        }
    }

    resize() {
        this.#map?.resize();
    }

    pause() {
        this.#stopAnimation();
    }

    resume() {
        if (this.#map && this.#slices.length) {
            this.#animate();
        }
    }

    destroy() {
        if (!this.#map) return;
        this.#stopAnimation();
        this.#map.remove();
        this.#map = null;
        this.#ttl = 0;
        this.#slices = [];
        this.#preloaded = false;
        this.#preloadPromise = null;
    }

    #stopAnimation() {
        if (this.#animTimer) { clearInterval(this.#animTimer); this.#animTimer = null; }
        if (this.#loopTimer) { clearTimeout(this.#loopTimer); this.#loopTimer = null; }
    }

    async #fetchSlices(product) {
        if (this.#preloadPromise) return this.#preloadPromise;

        this.#preloadPromise = (async () => {
            try {
                this.#slices = await fetchTimeslices(this.#opts.twcApiKey, this.#opts.totalFrames, product);
                this.#preloaded = true;
                return this.#slices;
            } catch (err) {
                console.error(log(), "Slice fetch error:", err.message);
                this.#preloadPromise = null;
                throw err;
            }
        })();

        return this.#preloadPromise;
    }

    #waitForTiles(timeout = 20000) {
        return new Promise((resolve) => {
            if (this.#map.areTilesLoaded()) { resolve(); return; }
            const timer = setTimeout(() => { this.#map.off("idle", onIdle); resolve(); }, timeout);
            const onIdle = () => { clearTimeout(timer); resolve(); };
            this.#map.once("idle", onIdle);
        });
    }

    async #loadAndAnimate(product) {
        try {
            this.#map.resize();
            this.#stopAnimation();
            this.#frame = 0;
            this.#loops = 0;

            if (!this.#preloaded) {
                await this.#fetchSlices(product);
            }

            const style = this.#map.getStyle();
            if (style?.layers) {
                for (const layer of style.layers) {
                    if (layer.id.startsWith("radarlayer_")) {
                        this.#map.removeLayer(layer.id);
                        this.#map.removeSource(layer.id);
                    }
                }
            }

            const firstLabelLayer = this.#map.getStyle().layers.find(
                l => l.type === "symbol" || l.id.includes("boundary") || l.id.includes("border")
            )?.id;

            const failedSources = new Set();
            const onError = (e) => {
                if (e.sourceId?.startsWith("radarlayer_")) failedSources.add(e.sourceId);
            };
            this.#map.on("error", onError);

            for (let i = 0; i < this.#slices.length; i++) {
                const ts = this.#slices[i];
                this.#map.addLayer({
                    id: `radarlayer_${ts.ts}`,
                    type: "raster",
                    source: {
                        type: "raster",
                        tiles: [
                            `https://api.weather.com/v3/TileServer/tile/${product}?ts=${ts.ts}&xyz={x}:{y}:{z}&apiKey=${this.#opts.twcApiKey}`,
                        ],
                        tileSize: 512,
                    },
                    layout: { visibility: "visible" },
                    paint: {
                        "raster-opacity": 0,
                        "raster-opacity-transition": { duration: 0, delay: 0 },
                        "raster-fade-duration": 0,
                    },
                }, firstLabelLayer);
            }

            await this.#waitForTiles();
            this.#map.off("error", onError);

            if (failedSources.size) {
                for (const id of failedSources) {
                    try { this.#map.removeLayer(id); this.#map.removeSource(id); } catch (_) {}
                }
                this.#slices = this.#slices.filter(ts => !failedSources.has(`radarlayer_${ts.ts}`));
                console.warn(log(), `Dropped ${failedSources.size} failed radar frames`);
            }

            this.#animate();
        } catch (err) {
            console.error(log(), "Radar error:", err.message);
        }
    }

    #animate() {
        if (!this.#slices.length || this.#loops >= this.#opts.maxLoops) return;

        this.#animTimer = setInterval(() => {
            if (this.#frame >= this.#slices.length) {
                clearInterval(this.#animTimer);
                this.#loopTimer = setTimeout(() => {
                    this.#frame = 0;
                    this.#loops++;
                    this.#animate();
                }, this.#opts.loopGap);
                return;
            }

            const ts = this.#slices[this.#frame];

            if (this.#timeEl) {
                this.#timeEl.textContent = formatTime(ts.ts);
            }

            if (typeof this.#onFrame === "function") {
                this.#onFrame(this.#frame, this.#slices.length, ts);
            }

            for (let i = 0; i < this.#slices.length; i++) {
                this.#map.setPaintProperty(
                    `radarlayer_${this.#slices[i].ts}`,
                    "raster-opacity",
                    i === this.#frame ? this.#opts.radarOpacity : 0
                );
            }

            this.#frame++;
        }, this.#opts.frameDelay);

        this.#loops++;
    }
}

const mainRadar = new RadarMap("radar", {
    timeElement: document.getElementById("main-radar-time"),
});

export function clearMap() { mainRadar.destroy(); }
export function resizeRadar() { mainRadar.resize(); }
export let mapTTL = 0;

export async function preloadRadar(lat, lon, product) {
    await mainRadar.preload(product);
}

export async function drawMap(lat, lon, product, zoom, htmlID) {
    if (htmlID !== "radar-div-so-that-mapbox-will-be-happy") {
        console.warn(log(), `drawMap called with non-main container "${htmlID}" — use RadarMap class directly`);
    }
    await mainRadar.init(lat, lon, zoom, product);
    mapTTL = mainRadar.ttl;
}

export async function easeMapTo(lat, lon, product, zoom) {
    await mainRadar.flyTo(lat, lon, zoom, product);
    mapTTL = mainRadar.ttl;
}