import { requestWxData } from './data.js';
import { weatherIcons, locationConfig, serverConfig, displayUnits } from '../config.js';
import { RadarMap } from './radar.js';

const radarInstance = new RadarMap('sidebar-radar-map', {
    totalFrames:  18,
    frameDelay:   220,
    loopGap:      1500,
    maxLoops:     Infinity,
    labelTextSize: 22,
});

const CHAR_MS = 0.1;
const HOLD_MS = 5000;

const conditionsLocation = document.getElementById('sidebar-conditions-location');
const conditionsTemp     = document.getElementById('sidebar-conditions-temp');
const conditionsPhrase   = document.getElementById('sidebar-conditions-phrase');
const conditionsIcon     = document.getElementById('sidebar-conditions-icon');

const summaryContainer = document.getElementById('sidebar-summary-lines');
const lineEl = (() => {
    const el = document.createElement('div');
    el.className = 'sidebar-summary-line';
    summaryContainer?.appendChild(el);
    return el;
})();

let latestLines   = [];
let summaryRunning = false;
let lineIdx       = 0;
let cancelCurrent = null;

function updateSidebarSummary(lines) {
    latestLines = lines;
    if (!summaryRunning && summaryContainer) {
        summaryRunning = true;
        playLine();
    }
}

function playLine() {
    if (!latestLines.length) return;
    if (lineIdx >= latestLines.length) lineIdx = 0;

    const target = latestLines[lineIdx] ?? '';
    let charIdx   = 0;
    let cancelled = false;
    let timer     = null;

    if (cancelCurrent) cancelCurrent();
    cancelCurrent = () => { cancelled = true; clearTimeout(timer); };

    lineEl.textContent = '';

    function type() {
        if (cancelled) return;
        if (charIdx <= target.length) {
            lineEl.textContent = target.slice(0, charIdx++);
            timer = setTimeout(type, CHAR_MS);
        } else {
            timer = setTimeout(() => {
                if (cancelled) return;
                lineEl.textContent = '';
                lineIdx++;
                playLine();
            }, HOLD_MS);
        }
    }

    type();
}

const REFRESH_MS = 10 * 60 * 1000;

const primaryGroup = locationConfig.localLocations.find(
    g => g.playlist === 'primary' && g.index === 0
);
const primaryLocation = primaryGroup?.locations?.[0]?.name ?? null;

const selectedDisplayUnits = displayUnits[serverConfig.units] || displayUnits['m'];
const { endingTemp, endingWind, endingDistance, endingPressure, endingCeiling, endingMeasurement } = selectedDisplayUnits;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

async function refreshSidebar() {
    if (!primaryLocation) return;

    const wxData = await requestWxData(primaryLocation, 'primary');

    const lat = wxData?.metadata?.localeData?.lat ?? null;
    const lon = wxData?.metadata?.localeData?.lon ?? null;

    if (lat && lon) {
        await radarInstance.init(lat, lon, 6, 'twcRadarHcMosaic');
        requestAnimationFrame(() => radarInstance.resize());
    }

    const current = wxData?.weather?.['v3-wx-observations-current'] ?? null;
    if (!current) return;

    const displayName = primaryGroup.locations[0].displayName ?? primaryLocation;
    const iconEntry   = weatherIcons[current.iconCode];
    const iconFile    = iconEntry ? iconEntry[current.dayorNight === 'D' ? 0 : 1] : 'not-available.svg';

    if (conditionsLocation) conditionsLocation.textContent = displayName;
    if (conditionsTemp)     conditionsTemp.textContent     = `${current.temperature}${endingTemp}`;
    if (conditionsPhrase)   conditionsPhrase.textContent   = current.wxPhraseLong;
    if (conditionsIcon)     conditionsIcon.src              = `/graphics/animated/${iconFile}`;

    const ceiling   = current.cloudCeiling == null ? 'Unlimited' : `${current.cloudCeiling}${endingCeiling}`;
    const month     = MONTHS[new Date().getMonth()];
    const precip    = current.precipMonth ?? current.precip24Hour;
    const precipStr = precip != null ? `${precip} ${endingMeasurement}` : '--';

    updateSidebarSummary([
        `Pressure: ${current.pressureAltimeter} ${endingPressure}`,
        `Wind: ${current.windDirectionCardinal}  ${current.windSpeed} ${endingWind}`,
        `Dewpoint: ${current.temperatureDewPoint}${endingTemp}`,
        `Humidity:  ${current.relativeHumidity}%`,
        `Visibility:  ${current.visibility} ${endingDistance}.`,
        `Ceiling: ${ceiling}`,
        `${month} Precipitation:  ${precipStr}`,
    ]);
}

requestAnimationFrame(() => requestAnimationFrame(refreshSidebar));
setInterval(refreshSidebar, REFRESH_MS);
