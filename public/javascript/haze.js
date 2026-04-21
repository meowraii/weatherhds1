import { config } from "../config.js";

if (!config.haze?.enabled) {
    document.querySelector(".sidebar-haze-display")?.remove();
    throw new Error("[haze.js] Haze integration disabled.");
}

const dom = {
    display:    document.querySelector(".sidebar-haze-display"),
    art:        document.getElementById("sidebar-haze-albumart"),
    title:      document.getElementById("sidebar-haze-title"),
    artist:     document.getElementById("sidebar-haze-artist"),
    album:      document.getElementById("sidebar-haze-album"),
    elapsed:    document.querySelector(".sidebar-haze-current-time"),
    duration:   document.querySelector(".sidebar-haze-duration"),
    progress:   document.getElementById("sidebar-haze-progress"),
};

let progressTimer = null;
let serverElapsed = 0;
let lastSyncTime = null;
let trackDuration = 0;

function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function updateProgressUI(current, total) {
    dom.elapsed.textContent = formatTime(current);
    dom.progress.style.width = total > 0 ? `${Math.min(100, (current / total) * 100)}%` : "0%";
}

function startProgress() {
    stopProgress();
    progressTimer = setInterval(() => {
        const current = serverElapsed + (Date.now() - lastSyncTime) / 1000;
        updateProgressUI(current, trackDuration);
    }, 200);
}

function stopProgress() {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
}

const SCROLL_HOLD_START  = 2000;
const SCROLL_HOLD_END    = 4000;
const SCROLL_FADE_MS     = 300;
const SCROLL_PX_PER_SEC  = 30;

function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function applyScroll(el) {
    const wrap = el.parentElement;

    if (el._scrollCancel) { el._scrollCancel(); el._scrollCancel = null; }
    el.style.cssText = "";

    requestAnimationFrame(() => {
        const overflow = el.scrollWidth - wrap.clientWidth;
        if (overflow <= 0) return;

        const dist = overflow + 20;
        const scrollDuration = (dist / SCROLL_PX_PER_SEC) * 1000;
        let cancelled = false;
        const timers = [];

        el._scrollCancel = () => {
            cancelled = true;
            timers.forEach(clearTimeout);
            el.style.cssText = "";
        };

        function cycle() {
            if (cancelled) return;

            timers.push(setTimeout(() => {
                if (cancelled) return;

                const start = performance.now();
                function scrollFrame(now) {
                    if (cancelled) return;
                    const p = Math.min(1, (now - start) / scrollDuration);
                    el.style.transform = `translateX(-${dist * easeInOut(p)}px)`;
                    if (p < 1) {
                        requestAnimationFrame(scrollFrame);
                    } else {
                        timers.push(setTimeout(() => {
                            if (cancelled) return;
                            el.style.transition = `opacity ${SCROLL_FADE_MS}ms ease`;
                            el.style.opacity = "0";

                            timers.push(setTimeout(() => {
                                if (cancelled) return;
                                el.style.transition = "none";
                                el.style.transform = "translateX(0)";

                                requestAnimationFrame(() => {
                                    if (cancelled) return;
                                    el.style.transition = `opacity ${SCROLL_FADE_MS}ms ease`;
                                    el.style.opacity = "1";

                                    timers.push(setTimeout(() => {
                                        if (cancelled) return;
                                        el.style.transition = "";
                                        cycle();
                                    }, SCROLL_FADE_MS));
                                });
                            }, SCROLL_FADE_MS));
                        }, SCROLL_HOLD_END));
                    }
                }
                requestAnimationFrame(scrollFrame);
            }, SCROLL_HOLD_START));
        }

        cycle();
    });
}

function apply(data) {
    const t = data.track || {};
    const isPlaying = data.state === "PLAYING";

    serverElapsed = data.elapsed || 0;
    lastSyncTime = Date.now();
    trackDuration = t.duration || 0;

    dom.title.textContent = t.title || "Unknown Title";
    dom.artist.textContent = t.artist || "Unknown Artist";
    dom.album.textContent = t.album ? `${t.album}${t.year ? ` (${t.year})` : ""}` : "Unknown Album";
    dom.duration.textContent = formatTime(trackDuration);

    requestAnimationFrame(() => {
        applyScroll(dom.title);
        applyScroll(dom.artist);
        applyScroll(dom.album);
    });

    if (t.has_art) {
        dom.art.src = `${config.haze.socketUrl}/art?t=${Date.now()}`;
        dom.art.style.display = "block";
    } else {
        dom.art.style.display = "none";
    }

    dom.display.classList.toggle("haze-playing", isPlaying);

    stopProgress();
    if (isPlaying) {
        startProgress();
    } else {
        updateProgressUI(serverElapsed, trackDuration);
    }
}

function crossfade(data) {
    dom.title.classList.add("haze-fade");
    dom.artist.classList.add("haze-fade");
    dom.album.classList.add("haze-fade");
    setTimeout(() => {
        apply(data);
        dom.title.classList.remove("haze-fade");
        dom.artist.classList.remove("haze-fade");
        dom.album.classList.remove("haze-fade");
    }, 250);
}

const socket = io(config.haze.socketUrl, { transports: ["websocket"] });

socket.on("track_change", data => {
    serverElapsed = 0;
    lastSyncTime = Date.now();
    crossfade(data);
});

socket.on("state", data => apply(data));

socket.on("connect_error", () => {
    console.warn("[haze.js] Socket connection failed:", config.haze.socketUrl);
});
