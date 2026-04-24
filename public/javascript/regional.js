import { config, locationConfig, displayUnits, serverConfig, weatherIcons } from "../config.js";
import { requestWxData } from "./data.js";
import { RadarMap } from "./radar.js";

const log = () => `[regional.js] | ${new Date().toLocaleString()} |`;
const iconDir = config.staticIcons ? "static" : "animated";
const units = displayUnits[serverConfig.units] || displayUnits["m"];

const SLIDE_DURATION = 12000;
const SLIDE_EXIT_DURATION = 320;

const dom = {
    regionalSlides: document.querySelector(".regional-slides"),
    mainSlides: document.querySelector(".main-slides"),
    bumperSlides: document.querySelector(".bumper-slides"),
    radarContainer: document.getElementById("regional-radar-map"),
    currentSlide: document.getElementById("current-regional"),
    forecast1Slide: document.getElementById("forecast1-regional"),
    forecast2Slide: document.getElementById("forecast2-regional"),
    radarTimeLabel: document.querySelector(".left-container-radar .regional-current-labels .regional-current-label:last-child"),
    radarRegionLabel: document.querySelector(".left-container-radar .regional-current-labels .regional-current-label:first-child"),
    slideInfoIcon: document.getElementById("slide-info-icon"),
    slideInfoName: document.getElementById("slide-info-name"),
    slideProgressBar: document.getElementById("slide-progress-bar"),
    currentLocationName: document.getElementById("upnext-current-location-name"),
};

function iconPath(iconCode, dayOrNight) {
    const entry = weatherIcons[String(iconCode)];
    if (!entry) return "not-available.svg";
    return entry[dayOrNight === "D" ? 0 : 1] || "not-available.svg";
}

function getAllRegions() {
    const out = [];
    for (const [name, data] of Object.entries(locationConfig.regionalLocations?.regions || {})) {
        out.push({ name, ...data, country: "Canada" });
    }
    for (const [name, data] of Object.entries(locationConfig.usaLocations?.regions || {})) {
        out.push({ name, ...data, country: "USA" });
    }
    return out;
}

async function fetchRegionData(locations) {
    const results = await Promise.allSettled(
        locations.map(loc => requestWxData(loc, "regional"))
    );
    return results.map((r, i) => ({
        location: locations[i],
        data: r.status === "fulfilled" ? r.value : null,
    }));
}

function buildCurrentCard(locationName, wxData) {
    const card = document.createElement("div");
    card.className = "class-regional-location-slimcard";

    const current = wxData?.weather?.["v3-wx-observations-current"];

    const name = document.createElement("div");
    name.className = "regional-location-name";
    name.textContent = locationName.split(",")[0];
    card.appendChild(name);

    const temp = document.createElement("div");
    temp.className = "regional-location-temp";
    temp.textContent = current ? `${current.temperature ?? "--"}${units.endingTemp}` : `--${units.endingTemp}`;
    card.appendChild(temp);

    const cond = document.createElement("div");
    cond.className = "regional-location-condition";
    cond.textContent = current?.wxPhraseShort ?? "";
    card.appendChild(cond);

    const icon = document.createElement("img");
    icon.className = "regional-location-icon";
    icon.src = `/graphics/${iconDir}/${current ? iconPath(current.iconCode, current.dayorNight) : "not-available.svg"}`;
    card.appendChild(icon);

    return card;
}

function buildForecastCard(locationName, wxData, dayIndex) {
    const card = document.createElement("div");
    card.className = "class-regional-location-slimcard";

    const forecast = wxData?.weather?.["v3-wx-forecast-daily-3day"] ?? wxData?.weather?.["v3-wx-forecast-daily-7day"] ?? null;
    const dp = forecast?.daypart?.[0];

    const name = document.createElement("div");
    name.className = "regional-location-name";
    name.textContent = locationName.split(",")[0];
    card.appendChild(name);

    const high = document.createElement("div");
    high.className = "regional-location-temp";
    high.textContent = forecast ? `${forecast.calendarDayTemperatureMax?.[dayIndex] ?? "--"}°` : "--°";
    high.style.color = "var(--textColourTempHigh)";
    card.appendChild(high);

    const low = document.createElement("div");
    low.className = "regional-location-temp";
    low.style.color = "var(--textColourTempLow)";
    low.textContent = forecast ? `${forecast.calendarDayTemperatureMin?.[dayIndex] ?? "--"}°` : "--°";
    card.appendChild(low);

    const dpDay = dayIndex * 2;
    const dpNight = dpDay + 1;
    const condText = dp?.wxPhraseShort?.[dpDay] ?? dp?.wxPhraseShort?.[dpNight] ?? "";
    const ic = dp?.iconCode?.[dpDay] ?? dp?.iconCode?.[dpNight];
    const dn = dp?.dayOrNight?.[dpDay] ?? dp?.dayOrNight?.[dpNight] ?? "D";

    const cond = document.createElement("div");
    cond.className = "regional-location-condition";
    cond.textContent = condText;
    card.appendChild(cond);

    const icon = document.createElement("img");
    icon.className = "regional-location-icon";
    icon.src = `/graphics/${iconDir}/${ic != null ? iconPath(ic, dn) : "not-available.svg"}`;
    card.appendChild(icon);

    return card;
}

function decorateSlideMotion(slideEl) {
    const labels = slideEl.querySelectorAll(".regional-current-label");
    const totalLabels = labels.length;

    labels.forEach((label, index) => {
        label.style.setProperty("--regional-label-order", String(index));
        label.style.setProperty("--regional-label-exit-order", String(totalLabels - index - 1));
    });

    const cards = slideEl.querySelectorAll(".class-regional-location-slimcard");
    const totalCards = cards.length;

    cards.forEach((card, cardIndex) => {
        card.style.setProperty("--regional-card-order", String(cardIndex));
        card.style.setProperty("--regional-card-exit-order", String(totalCards - cardIndex - 1));

        Array.from(card.children).forEach((element, elementIndex) => {
            element.style.setProperty("--regional-element-order", String(elementIndex));
            element.style.setProperty("--regional-element-exit-order", String(card.children.length - elementIndex - 1));
        });
    });
}

function populateSlide(slideEl, regionName, label, locationData, buildCardFn) {
    const labels = slideEl.querySelectorAll(".regional-current-label");
    if (labels[0]) labels[0].textContent = regionName;
    if (labels[1]) labels[1].textContent = label;

    const list = slideEl.querySelector(".regional-locations-list");
    list.innerHTML = "";

    for (const { location, data } of locationData) {
        list.appendChild(buildCardFn(location, data));
    }

    decorateSlideMotion(slideEl);
}

const regionalRadar = new RadarMap("regional-radar-map", {
    timeElement: document.querySelector(".left-container-radar .regional-current-labels .regional-current-label:last-child"),
    product: "satrad",
    maxLoops: Infinity,
});

async function initRegionalRadar(center, zoom) {
    if (!regionalRadar.isActive) {
        await regionalRadar.init(center[0], center[1], zoom);
    } else {
        await regionalRadar.flyTo(center[0], center[1], zoom);
    }
}

function resetSlideState(slideEl) {
    if (!slideEl) return;

    slideEl.classList.remove("is-active", "is-entering", "is-leaving");
    slideEl.style.animation = "none";
    slideEl.style.display = "none";
}

function showSlide(slideId) {
    const slides = [dom.currentSlide, dom.forecast1Slide, dom.forecast2Slide];
    const el = document.getElementById(slideId);

    slides.forEach(slide => {
        if (slide !== el) {
            resetSlideState(slide);
        }
    });

    if (el) {
        el.classList.remove("is-active", "is-entering", "is-leaving");
        el.style.animation = "none";
        el.style.display = "block";
        void el.offsetWidth;
        el.classList.add("is-active", "is-entering");

        window.setTimeout(() => {
            if (el.classList.contains("is-active")) {
                el.classList.remove("is-entering");
            }
        }, 1200);
    }
}

function hideSlide(slideId) {
    const el = document.getElementById(slideId);
    if (!el) return Promise.resolve();

    el.classList.remove("is-entering");
    el.classList.add("is-leaving");

    return new Promise(resolve => {
        window.setTimeout(() => {
            resetSlideState(el);
            resolve();
        }, SLIDE_EXIT_DURATION);
    });
}

function updateSlideInfo(locationName, slideLabel, totalDuration) {
    if (dom.currentLocationName) dom.currentLocationName.textContent = locationName;
    if (dom.slideInfoName) {
        dom.slideInfoName.textContent = slideLabel;
        dom.slideInfoName.style.cssText = "display:block;animation:switchModules 300ms ease-in-out forwards";
    }
    if (dom.slideInfoIcon) {
        dom.slideInfoIcon.src = "/graphics/ux/map-pinned.svg";
        dom.slideInfoIcon.style.cssText = "display:block;animation:switchModules 160ms ease-in-out forwards";
    }
    if (dom.slideProgressBar) {
        dom.slideProgressBar.style.cssText = `display:block;animation:progressBar ${totalDuration}ms linear forwards`;
    }
}

export async function runRegionalPlayback(regions, callback) {
    if (!regions?.length) {
        regions = getAllRegions();
    }
    if (regions.length === 0) {
        console.warn(log(), "No regional locations configured");
        callback?.();
        return;
    }

    dom.regionalSlides.style.display = "flex";
    dom.mainSlides.style.display = "none";
    dom.bumperSlides.style.display = "none";

    if (dom.radarRegionLabel) dom.radarRegionLabel.textContent = "Radar/Satellite";

    for (const region of regions) {
        console.log(log(), `Regional playback: ${region.name} (${region.country})`);

        const locationData = await fetchRegionData(region.locations);

        const firstForecast = locationData.find(
            d => d.data?.weather?.["v3-wx-forecast-daily-3day"]
        )?.data?.weather?.["v3-wx-forecast-daily-3day"];
        const dp = firstForecast?.daypart?.[0];

        const forecast1Label = dp?.daypartName?.[0] ?? dp?.daypartName?.[1] ?? "Tonight";
        const forecast2Label = dp?.daypartName?.[2] ?? dp?.daypartName?.[3] ?? "Tomorrow";

        const regionLabel = region.country === "USA"
            ? `${region.name} US`
            : `${region.name}`;

        populateSlide(
            dom.currentSlide, regionLabel, "Current Observations", locationData,
            (loc, data) => buildCurrentCard(loc, data)
        );
        populateSlide(
            dom.forecast1Slide, regionLabel, forecast1Label, locationData,
            (loc, data) => buildForecastCard(loc, data, 0)
        );
        populateSlide(
            dom.forecast2Slide, regionLabel, forecast2Label, locationData,
            (loc, data) => buildForecastCard(loc, data, 1)
        );

        await initRegionalRadar(region.mapCenter, region.zoomLevel);

        const slides = [
            { id: "current-regional", label: "Current Observations" },
            { id: "forecast1-regional", label: forecast1Label },
            { id: "forecast2-regional", label: forecast2Label },
        ];

        for (const slide of slides) {
            updateSlideInfo(regionLabel, slide.label, SLIDE_DURATION);
            showSlide(slide.id);

            await new Promise(resolve => {
                window.setTimeout(resolve, SLIDE_DURATION - SLIDE_EXIT_DURATION);
            });

            await hideSlide(slide.id);
        }
    }

    regionalRadar.destroy();

    dom.regionalSlides.style.display = "none";
    dom.mainSlides.style.display = "flex";

    if (dom.slideProgressBar) {
        dom.slideProgressBar.style.cssText = "display:none;animation:none";
    }

    callback?.();
}