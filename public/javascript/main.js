import { config } from "../config.js";
import { fetchOnlineBackground } from "./data.js";

const domElements = {
    viewport: document.getElementsByClassName("view")[0],
    mainSlides: document.getElementsByClassName("main-slides")[0],
    regionalSlides: document.getElementsByClassName("regional-slides")[0],
    bumperSlides: document.getElementsByClassName("bumper-slides")[0],
    contentArea: document.getElementsByClassName("content-area")[0],
    wallpaper: document.getElementsByClassName("wallpaper")[0],
    topBar: document.getElementsByClassName("topbar")[0],
    ldl: document.getElementsByClassName("ldl-presentation")[0],
    ldlContainer: document.getElementsByClassName("ldl-weather")[0],
    ldlBranding: document.getElementsByClassName("ldl-netlogo")[0],
    date: document.getElementById("date"),
    time: document.getElementById("time"),
    dateLDL: document.getElementById("dateLDL"),
    timeLDL: document.getElementById("timeLDL"),
    i2SidebarBuffer: document.getElementsByClassName("i2-sidebar-buffer")[0],
    upnextLocation2: document.getElementById('upnext-location2'),
    ldlMarquee: document.getElementsByClassName('ldl-marquee')[0],
    marqueeTicker: document.getElementById('marquee-ticker')
};

const { viewport, mainSlides, regionalSlides, bumperSlides, wallpaper, topBar, ldl, ldlContainer, ldlBranding, contentArea } = domElements;
const date = domElements.date;
const time = domElements.time;
const dateLDL = domElements.dateLDL;
const timeLDL = domElements.timeLDL;

let broadcastState = 0; // zero is good weather, one is bad weather.

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: config.systemTimeZone,
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
});

function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

const logTheFrickinTime = `[main.js] | ${new Date().toLocaleString()} |`;

function initBackgrounds() {
        if (config.backgroundSource === "online") {
            async function onlineBg() {
                const url = await fetchOnlineBackground();
                console.log(logTheFrickinTime, "Fetched new online background:", url);
                wallpaper.style.backgroundImage = `url(${url})`;
            }
            setInterval(onlineBg, 8 * 36000000);
            onlineBg();
        } 
        if (config.backgroundSource === "local") {
            async function initLocalBackground() {
                const weatherType = broadcastState === 0 ? "wxgood" : "wxbad";
                const post = await fetch('/backgrounds/init', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'text/plain'
                    },
                    body: `[${weatherType}]`
                });
                const result = await post.text();
                console.log(logTheFrickinTime, result);
            }

            async function fetchLocalBackground() {
                const response = await fetch('/backgrounds/image');
                if (response.ok) {
                    const imageUrl = await response.text();
                    wallpaper.style.backgroundImage = `url(${imageUrl})`;
                    console.log(logTheFrickinTime, "Applied background image:", imageUrl);
                } else {
                    console.warn(logTheFrickinTime, "Failed to fetch background image");
                }
            }
            
            initLocalBackground();

            setTimeout(() => {
                fetchLocalBackground();
            }, 1000);
            
            setInterval(() => {
                initLocalBackground();
                setTimeout(() => {
                    fetchLocalBackground();
                }, 500);
            }, 8 * 36000000);
        }
}

const VIDEO_MODES = Object.freeze({
    vga: { width: 1920, height: 1440, barWidth: "95%" },
    hdtv: { width: 2560, height: 1440, barWidth: "95%" },
    ntsc: { width: 2160, height: 1440, barWidth: "95%" },
    tablet: { width: 2304, height: 1440, barWidth: "95%" },
    i2sidebar: { width: 2048, height: 1440, barWidth: "95%" },
    i2buffer: { width: 2560, height: 1440, barWidth: "95%" },
});

const videoTypeParam = new URLSearchParams(window.location.search).get('videoType');
if (videoTypeParam !== null) {
    config.videoType = String(videoTypeParam).toLowerCase();
}

function ScaleViewportToTheWindowIGuessLmao() {
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;
    const mode = VIDEO_MODES[config.videoType] || VIDEO_MODES.vga;
    const { width, barWidth } = mode;

    const scaleRatio = Math.min(containerWidth / width, containerHeight / mode.height);
    const centeredLeft = (containerWidth - width * scaleRatio) / 2;
    const centeredTop = (containerHeight - mode.height * scaleRatio) / 2;

    viewport.style.cssText = `width:${width}px;transform-origin:top left;left:${centeredLeft}px;top:${centeredTop}px;transform:scale(${scaleRatio})`;
    
    ldlContainer.style.width = barWidth;
    topBar.style.width = barWidth;
    contentArea.style.width = barWidth;

    const mainVideoBlock = [
        regionalSlides,
        bumperSlides,
    ]

    if (config.videoType === "i2buffer" && domElements.i2SidebarBuffer) {
        domElements.i2SidebarBuffer.style.display = 'block';

        mainVideoBlock.forEach((el) => {
            el.style.width = '80%';
        });
    }

    if (config.videoType !== "hdtv" && config.videoType !== "tablet" && config.videoType !== "i2Sidebar" && domElements.upnextLocation2) {
        domElements.upnextLocation2.style.display = 'none';
    }
}

window.addEventListener('resize', debounce(ScaleViewportToTheWindowIGuessLmao, 100));

function clock() {
    const now = new Date();
    const dateStr = `${DAYS[now.getDay()]} ${MONTHS[now.getMonth()]} ${now.getDate()} ${now.getFullYear()}`;
    const timeStr = dateFormatter.format(now);

    if (date.textContent !== dateStr) {
        date.textContent = dateStr;
        dateLDL.textContent = dateStr;
    }
    time.textContent = timeStr;
    timeLDL.textContent = timeStr;
}

clock();
setInterval(clock, 1000);

function presentationType() {


    const mainPres = new URLSearchParams(window.location.search).get('main');
    const ldlPres = new URLSearchParams(window.location.search).get('ldl');
    const backgrounds = new URLSearchParams(window.location.search).get('backgrounds');
    const repeatMain = new URLSearchParams(window.location.search).get('repeatMain');
    const ldlClock = new URLSearchParams(window.location.search).get('ldlClock');
    const ldlBack = new URLSearchParams(window.location.search).get('ldlBack')

    if (mainPres !== null) {
        const parsed = mainPres.toLowerCase() === 'true';
        config.presentationConfig.main = parsed;
    }

    if (ldlPres !== null) {
        const parsed = ldlPres.toLowerCase() === 'true';
        config.presentationConfig.ldl = parsed;
    }
    
    if (backgrounds !== null) {
        const parsed = backgrounds.toLowerCase() === 'true';
        config.presentationConfig.backgrounds = parsed;
    }
    if (repeatMain !== null) {
        const parsed = repeatMain.toLowerCase() === 'true';
        config.presentationConfig.repeatMain = parsed;
    }

    if (ldlClock !== null) {
        const parsed = ldlClock.toLowerCase() === 'true';
        config.presentationConfig.ldlClock = parsed;
    }

    if (ldlBack !== null) {
        const parsed = ldlBack.toLowerCase() === 'true';
        config.presentationConfig.ldlBack = parsed;
    }

    if (config.presentationConfig.main != true) {
        wallpaper.style.display = `none`
        mainSlides.style.display = `none`
        topBar.style.display = `none`
    } else {
        ldlBranding.style.display = `none`
    }

    if (config.presentationConfig.backgrounds != true) {
        wallpaper.style.display = `none`
    } else {
        wallpaper.style.display = `block`
    }

    if (config.presentationConfig.ldl != true) {
        if (config.presentationConfig.ldlClock) {
            ldlBranding.style.display = `block`
        }
        ldl.style.display = `none`;
    }
    if (config.presentationConfig.ldlBack === false) {
        ldlBranding.style.display = `none`
        ldlContainer.style.borderLeft = `none`
        ldlContainer.style.borderRight = `none`
        ldlContainer.style.borderTop = `none`
        ldlContainer.style.backgroundColor = `transparent`
        ldlContainer.style.backdropFilter = `none`
    }
}

function scrollTicker() {
    if (!config.tickerContent) {
        if (domElements.ldlMarquee) domElements.ldlMarquee.style.display = 'none';
        return;
    }
    
    if (domElements.marqueeTicker) {
        domElements.marqueeTicker.textContent = config.tickerContent;
        $(domElements.marqueeTicker).marquee({
            duration: 9000,
            gap: 360,
            delayBeforeStart: 0,
            direction: 'left',
            duplicated: true,
            pauseOnHover: true,
        });
    }
}

window.onload = () => {
    ScaleViewportToTheWindowIGuessLmao();
    presentationType();
    scrollTicker();
    initBackgrounds();
};

const refreshInterval = config.refreshInterval * 60000;
if (refreshInterval > 0) {
    setTimeout(() => {
        window.location.reload(true);
    }, refreshInterval);
}