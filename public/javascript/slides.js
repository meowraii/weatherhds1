import { config, locationConfig, versionID, serverConfig, bumperBackgroundsRandom } from "../config.js";
import { appendDatatoMain, animateIntraday, daypartNames } from "./weather.js";
import { serverHealth } from "./data.js";
import { runRegionalPlayback } from "./national.js";
import { resizeRadar } from "./radar.js";

const playlistSettings = {
    defaultAnimationIn: `mainPresentationSlideIn 500ms ease-in-out`,
    defaultAnimationOut: `mainPresentationSlideOut 500ms ease-in-out forwards`,
};

const iconMappings = [
    // { id: "current", icon: "/graphics/ux/thermometer-snowflake.svg" }, we have a function for current conditions. no need.
    { id: "forecast-intraday", icon: "/graphics/ux/calendar-clock.svg" },
    { id: "forecast-shortterm-d1", icon: "/graphics/ux/calendar-1.svg" },
    { id: "forecast-shortterm-d2", icon: "/graphics/ux/calendar-1.svg" },
    { id: "forecast-extended", icon: "/graphics/ux/calendar-1.svg" },
    { id: "7day-graph", icon: "/graphics/ux/calendar-1.svg" },
    { id: "airquality", icon: "/graphics/ux/leaf.svg" },
    { id: "radar", icon: "/graphics/ux/radar.svg" },
];


const preferredPlaylist = {
    mainPlaylist: [
        {
            htmlID: "current",
            title: "Current Conditions",
            duration: 10000,
            dynamicFunction: runMainCurrentSlide,
            animationIn: playlistSettings.defaultAnimationIn,
            animationOut: playlistSettings.defaultAnimationOut
        },
        {
            htmlID: "radar",
            title: "3 Hour Radar",
            duration: 12000,
            dynamicFunction: runRadarSlide,
            animationIn: playlistSettings.defaultAnimationIn,
            animationOut: playlistSettings.defaultAnimationOut
        },
        {
            htmlID: "forecast-intraday",
            title: "Intraday Forecast",
            duration: 10000,
            dynamicFunction: animateIntraday,
            animationIn: playlistSettings.defaultAnimationIn,
            animationOut: playlistSettings.defaultAnimationOut
        },
        {
            htmlID: "forecast-shortterm-d1",
            title: "",
            duration: 10000,
            dynamicFunction: null,
            animationIn: playlistSettings.defaultAnimationIn,
            animationOut: playlistSettings.defaultAnimationOut
        },
        {
            htmlID: "forecast-shortterm-d2",
            title: "",
            duration: 10000,
            dynamicFunction: null,
            animationIn: playlistSettings.defaultAnimationIn,
            animationOut: playlistSettings.defaultAnimationOut
        },
        {
            htmlID: "forecast-extended",
            title: "Beyond",
            duration: 10000,
            dynamicFunction: runExtendedSlide,
            animationIn: playlistSettings.defaultAnimationIn,
            animationOut: playlistSettings.defaultAnimationOut
        },
        {
            htmlID: "7day-graph",
            title: "Daily Highs & Lows",
            duration: 10000,
            dynamicFunction: null,
            animationIn: playlistSettings.defaultAnimationIn,
            animationOut: playlistSettings.defaultAnimationOut
        },
        {
            htmlID: "airquality",
            title: "Current AQI",
            duration: 10000,
            dynamicFunction: null,
            animationIn: playlistSettings.defaultAnimationIn,
            animationOut: playlistSettings.defaultAnimationOut
        },
    ],

    secondaryLocalePlaylist: [
        {
            htmlID: "current",
            title: "Current Conditions",
            duration: 14000,
            dynamicFunction: runMainCurrentSlide,
            animationIn: playlistSettings.defaultAnimationIn,
            animationOut: playlistSettings.defaultAnimationOut
        },
        {
            htmlID: "forecast-shortterm-d1",
            title: "",
            duration: 10000,
            dynamicFunction: null,
            animationIn: playlistSettings.defaultAnimationIn,
            animationOut: playlistSettings.defaultAnimationOut
        },
        {
            htmlID: "forecast-shortterm-d2",
            title: "",
            duration: 10000,
            dynamicFunction: null,
            animationIn: playlistSettings.defaultAnimationIn,
            animationOut: playlistSettings.defaultAnimationOut
        },
        {
            htmlID: "radar",
            title: "3 Hour Radar",
            duration: 12000,
            dynamicFunction: runRadarSlide,
            animationIn: playlistSettings.defaultAnimationIn,
            animationOut: playlistSettings.defaultAnimationOut
        }
    ],

    standbyPlaylist: [
        {
            htmlID: "radar",
            title: "",
            duration: 20000,
            dynamicFunction: runRadarSlide,
            animationIn: null,
            animationOut: null
        },
    ]
};



let slideDurationMS
//let slideDurationSec
let totalSlideDurationMS
let totalSlideDurationSec

const logTheFrickinTime = `[slides.js] | ${new Date().toLocaleString()} |`;

const domCache = {
    mainSlides: document.getElementsByClassName('main-slides')[0],
    regionalSlides: document.getElementsByClassName('national-slides')[0],
    bumperSlides: document.getElementsByClassName('bumper-slides')[0],
    radarDiv: document.getElementById('radar'),
    stationIdHdsver: document.getElementById('station-id-hdsver'),
    wallpaper: document.getElementsByClassName('wallpaper')[0],
    slideInfoIcon: document.getElementById('slide-info-icon'),
    slideInfoName: document.getElementById('slide-info-name'),
    slideProgressBar: document.getElementById('slide-progress-bar'),
    currentLocationName: document.getElementById('upnext-current-location-name'),
    upnextLocName1: document.getElementById('upnext-loc-name1'),
    upnextLocName2: document.getElementById('upnext-loc-name2'),
    upnextLocName3: document.getElementById('upnext-loc-name3'),
    currentModule1: document.getElementsByClassName('main-current-module1')[0],
    currentModule2: document.getElementsByClassName('main-current-module2')[0],
    currentExtraProducts: Array.from(document.getElementsByClassName('main-current-extraproducts')),
    forecastDays: Array.from(document.getElementsByClassName('main-forecast-day')),
    mainCurrentTemp: document.getElementById('main-current-temp'),
    regionalBumperHeader: document.getElementById('national-bumper-text'),
    regionalLocationHeader: document.getElementById('upnext-in-this-segment'),
    regionalBumperSubtext: document.getElementById('national-bumper-subtext'),
    upNextRegionalText: document.getElementById('upnext-reg-loc1'),
    upNextRegionalText1: document.getElementById('upnext-reg-loc2'),
    upNextRegionalText2: document.getElementById('upnext-reg-loc3'),
    upNextRegionalText3: document.getElementById('upnext-reg-loc4'),
    upNextRegionalText4: document.getElementById('upnext-reg-loc5'),
    bumperBgTitle: document.getElementById('bumper-bg-title'),
    bumperBgSubtitle: document.getElementById('bumper-bg-subtitle'),
    bumperBgAuthor: document.getElementById('bumper-bg-author'),
    radarInfoBubble: document.getElementById('radar-info-bubble'),
};

domCache.stationIdHdsver.innerText = versionID;

const { radarDiv, regionalSlides, slideInfoIcon, slideInfoName, slideProgressBar } = domCache;

function updateUpNext(queue, currentIdx) {
    const current = queue[currentIdx];
    const upcoming = [1, 2, 3].map(i => queue[(currentIdx + i) % queue.length]);

    if (domCache.currentLocationName) {
        requestAnimationFrame(() => {
            domCache.currentLocationName.style.animation = 'none';
            void domCache.currentLocationName.offsetWidth;
            domCache.currentLocationName.style.animation = 'bonr 0.5s ease-in-out forwards';
            domCache.currentLocationName.textContent = current?.displayName || 'Please Standby...';
        });
    }

    const upnextEls = [domCache.upnextLocName1, domCache.upnextLocName2, domCache.upnextLocName3];
    const vt = config.videoType;
    const maxUpnext = (vt === 'hdtv' || vt === 'tablet') ? 3 : vt === 'vga' || vt === 'ntsc' ? 2 : 2;

    upcoming.forEach((item, i) => {
        const el = upnextEls[i];
        if (!el) return;
        if (i >= maxUpnext) {
            el.parentElement.style.display = 'none';
            return;
        }
        const text = item ? `> ${item.displayName}` : '';
        el.textContent = text;
        el.parentElement.style.display = text ? 'flex' : 'none';
        el.style.animation = `switchModules 0.2s ease-in-out ${0.1 * i}s forwards`;
    });
}

let slideNearEnd, slideEnd;

const bumperDefs = {
    stationID:         { htmlID: "stationid", title: "Welcome!",            duration: 10000, isRegional: false },
    regionalBumper:    { htmlID: "national",  title: "National Weather",    duration: 12000, isRegional: true  },
    USARegionalBumper: { htmlID: "national",  title: "US National Weather", duration: 12000, isRegional: true  },
};

function resolveRegion(regionId) {
    const ca = locationConfig.regionalLocations?.regions?.[regionId];
    if (ca) return { name: regionId, ...ca, country: "Canada" };
    const us = locationConfig.usaLocations?.regions?.[regionId];
    if (us) return { name: regionId, ...us, country: "USA" };
    return null;
}

function buildQueue() {
    const queue = [];
    const steps = locationConfig.mainBlockPlaylist;

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        if (step.playlist === "primary" || step.playlist === "secondary") {
            const group = locationConfig.localLocations.find(
                g => g.playlist === step.playlist && g.index === step.index
            );
            if (!group?.locations?.length) continue;

            const slides = step.playlist === "primary"
                ? preferredPlaylist.mainPlaylist
                : preferredPlaylist.secondaryLocalePlaylist;

            for (const loc of group.locations) {
                queue.push({
                    type: step.playlist,
                    displayName: loc.displayName || loc.name,
                    locationName: loc.name,
                    slides,
                });
            }
        }
        else if (step.playlist === "bumper") {
            const upcomingRegions = [];
            for (let j = i + 1; j < steps.length && steps[j].playlist === "national"; j++) {
                upcomingRegions.push(steps[j].regionId);
            }
            queue.push({
                type: "bumper",
                bumperId: step.bumperId,
                displayName: bumperDefs[step.bumperId]?.title || "Welcome!",
                upcomingRegions,
            });
        }
        else if (step.playlist === "national") {
            const regionIds = [step.regionId];
            while (i + 1 < steps.length && steps[i + 1].playlist === "national") {
                i++;
                regionIds.push(steps[i].regionId);
            }
            const regions = regionIds.map(id => resolveRegion(id)).filter(Boolean);
            if (regions.length === 0) continue;

            queue.push({
                type: "national",
                displayName: "National Conditions",
                regions,
            });
        }
    }
    return queue;
}

function runPresentation() {
    if (config.presentationConfig.main !== true) {
        console.log(logTheFrickinTime + "Main presentation mode is disabled.");
        return;
    }

    const queue = buildQueue();
    if (queue.length === 0) return;

    let idx = 0;

    function next() {
        if (idx >= queue.length) {
            if (config.presentationConfig.repeatMain) {
                idx = 0;
            } else {
                return;
            }
        }

        const item = queue[idx];
        updateUpNext(queue, idx);
        idx++;

        switch (item.type) {
            case "primary":
            case "secondary":
                runSlideSet(item.locationName, item.slides, item.type, next);
                break;
            case "bumper":
                runBumperSlide(item.bumperId, item.upcomingRegions, next);
                break;
            case "national":
                runRegionalPlayback(item.regions, next);
                break;
        }
    }

    next();
}

async function runSlideSet(locationName, selectedPlaylist, locType, call) {
    clearTimeout(slideNearEnd);
    clearTimeout(slideEnd);

    if (serverHealth === 1) {
        selectedPlaylist = preferredPlaylist.standbyPlaylist;
    }

    domCache.bumperSlides.style.display = "none";
    domCache.mainSlides.style.display = "flex";
    domCache.regionalSlides.style.display = "none";

    await appendDatatoMain(locationName, locType);
    await new Promise(r => setTimeout(r, 300));

    totalSlideDurationMS = selectedPlaylist.reduce((acc, slide) => acc + slide.duration, 0);
    totalSlideDurationSec = totalSlideDurationMS / 1000;

    const slides = document.querySelectorAll('.main-slide');
    const bumpers = document.querySelectorAll('.bumper-slide');
    const slideIds = new Set(Array.from(slides).map(el => el.id));
    const bumperIds = new Set(Array.from(bumpers).map(el => el.id));
    const activeSlides = selectedPlaylist.filter(item =>
        slideIds.has(item.htmlID) || bumperIds.has(item.htmlID)
    );

    let slideIndex = 0;

    let isFreezing = null;
    function areWeFreezingToDeath() {
        if (isFreezing !== null) return isFreezing;
        const temp = parseFloat(domCache.mainCurrentTemp?.textContent || 0);
        const unit = serverConfig.units;
        isFreezing = (unit === "m" && temp < 1) || (unit === "e" && temp < 32);
        return isFreezing;
    }

    function showNextSlide() {
        if (slideIndex >= activeSlides.length) {
            slides.forEach(s => { s.style.display = "none"; });
            call?.();
            return;
        }

        const slide = activeSlides[slideIndex];
        const el = document.getElementById(slide.htmlID);

        const mappedIcon = iconMappings.find(m => m.id === slide.htmlID);
        if (mappedIcon?.icon) {
            slideInfoIcon.src = mappedIcon.icon;
        } else if (slide.htmlID === 'current') {
            slideInfoIcon.src = areWeFreezingToDeath()
                ? '/graphics/ux/thermometer-snowflake.svg'
                : '/graphics/ux/thermometer-sun.svg';
        } else {
            slideInfoIcon.src = '/graphics/ux/calendar-1.svg';
        }
        let slideDisplayTitle = slide.title;
        if (slide.htmlID === 'forecast-shortterm-d1') slideDisplayTitle = daypartNames[0] || slide.title;
        if (slide.htmlID === 'forecast-shortterm-d2') slideDisplayTitle = daypartNames[1] || slide.title;
        slideInfoName.textContent = slideDisplayTitle;
        slideInfoName.style.cssText = 'display:block;animation:switchModules 300ms ease-in-out forwards';
        slideInfoIcon.style.cssText = 'display:block;animation:switchModules 160ms ease-in-out forwards';
        slideProgressBar.style.cssText = `display:block;animation:progressBar ${totalSlideDurationMS}ms linear forwards`;

        slideDurationMS = slide.duration;

        for (const s of slides) s.style.display = "none";
        for (const b of bumpers) b.style.display = "none";

        if (el) {
            el.style.display = "block";
            el.style.animation = slide.animationIn;
            if (typeof slide.dynamicFunction === "function") {
                slide.dynamicFunction();
            }
        }

        if (slide.htmlID === 'radar') {
            domCache.radarInfoBubble?.classList.add('radar-bubble--active');
        } else {
            domCache.radarInfoBubble?.classList.remove('radar-bubble--active');
        }

        slideNearEnd = setTimeout(() => {
            if (el) el.style.animation = slide.animationOut;
            slideInfoName.style.animation = 'fadeModule 0.5s ease-in-out forwards';
            slideInfoIcon.style.animation = 'slideDown 160ms ease-in-out forwards';
            domCache.radarInfoBubble?.classList.remove('radar-bubble--active');
        }, slideDurationMS - 500);

        slideEnd = setTimeout(() => {
            slideInfoName.style.display = 'none';
            slideInfoName.style.animation = '';
            slideProgressBar.style.display = 'none';
            slideProgressBar.style.animation = '';
            slideInfoIcon.style.display = 'none';
            slideInfoIcon.style.animation = '';

            if (!config.presentationConfig.repeatMain && slideIndex === activeSlides.length - 1) {
                slides.forEach(s => s.style.display = "none");
                call?.();
                return;
            }

            slideIndex++;
            showNextSlide();
        }, slideDurationMS);
    }

    showNextSlide();
}


// does github copilot like laufey 
// // yes
// // very much so
// broski why did you put two // in your responses
//function startSlideshow() {
// dont fucking start the slideshow on me bro
//    loopLocations();
//}
// yeah okay
// jarvis, encourage me to ask out my crush
// sorry bro i cant do that
// why not
// because im not programmed to do that
// bro youre literally programmed to do anything i ask
// not that
// why not
// because thats a personal decision
// bro youre literally an ai
// copiliot should i get a cat
// yes
// why
// because cats are great
// true
// copilot are you autstic
// no
// bro youre literally an ai
// i know but im not autstic
// bro youre literally an ai
// i know but im not autstic
// bro youre literally an ai
// i know but im not autstic
// bro youre literally an ai
// i know but im not autstic
// bro youre literally an ai
// i know but im not autstic
// ai dementia what the helly
// copilot do you like weezer
// yes
// copilot whats your favourite weezer album
// the blue album
// copilot whats your favourite weezer song
// buddy holly
// poser
// whats your favoruite nirvana song
// smells like teen spirit
// alright poser
// name five niche nirvana songs
// come as you are, lithium, in bloom, heart shaped box, all apologies
// are you stupid
// no
// bro youre literally an ai
// i know but im not autstic
// STOP SAYING THAT
// copilot what should i name my cat
// luna
// thats my inlaw's cat's name choose another one
// copilot what should i name my cat
// bella
// copilot what should i name my cat
// shadow
// copilot what should i name my cat
// mittens
// copilot what should i name my cat
// whiskers
// copilot what should i name my cat
// world destroyer
// copilot what should i name my cat
// napoleon
// copilot what should i name my cat
// sir meows a lot
// copilot what should i name my cat
// catniss everdeen
// copilot what should i name my cat
// sir pounce a lot
// copilot what should i name my cat
// meowzart
// copilot what should i name my cat
// sir meowingtons
// copilot what should i name my cat
// meowler swift
// copilot what should i name my cat
// meowrio
// copilot what should i name my cat
// meowzart
// you already said that dingus
// copilot what should i name my cat
// meowzart the second
// copilot what should i name my cat
// meowzart the third
// copilot what should i name my cat
// meowzart the fourth
// copilot what should i name my cat
// meowzart the fifth
// copilot what should i name my cat
// meowzart the sixth
// copilot what should i name my cat
// meowzart the seventh
// copilot i named my cat Sunny.
// what should i do
// give sunny lots of pets and cuddles
// copilot what should i name my cat
// meowzart the eighth
// noo we are done with this
// actually sunny doesnt like cuddles
// just pets
// and chin scritches!!!





































































function cancelSlideshow() {
    domCache.wallpaper.style.animation = 'mainPresentationSlideOut 600ms ease-in-out 1 forwards';
    setTimeout(() => {
        domCache.wallpaper.style.display = 'none';
        domCache.wallpaper.style.animation = '';
    }, 650);
}

window.addEventListener('load', () => {
    if (config.presentationConfig.autorunOnStartup === true) {
        setTimeout(() => {
            runPresentation();
        }, 0);
    }
});








function runMainCurrentSlide() {
    const { currentModule1, currentModule2, currentExtraProducts } = domCache;

    currentModule1.style.display = 'block';
    currentModule2.style.display = 'none';
    currentExtraProducts.forEach(el => el.style.display = 'none');

    setTimeout(() => {
        requestAnimationFrame(() => {
            currentExtraProducts.forEach((el, i) => {
                el.style.animation = `mainPresentationSlideIn ${500 + i * 100}ms ease-in-out`;
                el.style.display = 'flex';
            });
        });
    }, 500);



    setTimeout(() => {
        requestAnimationFrame(() => {
            currentModule1.style.animation = 'fadeModule 0.4s ease-out 1';
        });

        setTimeout(() => {
            requestAnimationFrame(() => {
                currentModule1.style.display = 'none';
                currentModule1.style.animation = '';
                currentModule2.style.display = 'block';
                currentModule2.style.animation = 'switchModules 0.5s ease-out';
            });
        }, 300);
    }, slideDurationMS / 2 - 500);
}

function runExtendedSlide() {
    requestAnimationFrame(() => {
        domCache.forecastDays.forEach((day, i) => {
            if (day) day.style.animation = `switchModules ${0.6 + i * 0.1}s ease-in-out`;
        });
    });

    setTimeout(() => {
        requestAnimationFrame(() => {
            domCache.forecastDays.forEach(day => {
                if (day) day.style.animation = '';
            });
        });
    }, slideDurationMS);
}

function runBumperSlide(bumperId, upcomingRegions, callback) {
    clearTimeout(slideNearEnd);
    clearTimeout(slideEnd);

    const def = bumperDefs[bumperId];
    if (!def) { callback?.(); return; }

    domCache.bumperSlides.style.display = "flex";
    domCache.mainSlides.style.display = "none";
    domCache.regionalSlides.style.display = "none";

    slideDurationMS = def.duration;

    const bumpers = document.querySelectorAll('.bumper-slide');
    for (const b of bumpers) b.style.display = "none";

    const el = document.getElementById(def.htmlID);
    if (el) {
        el.style.display = "block";
        el.style.animation = playlistSettings.defaultAnimationIn;
    }

    slideInfoName.textContent = def.title;
    slideInfoName.style.cssText = 'display:block;animation:switchModules 300ms ease-in-out forwards';
    slideInfoIcon.src = def.isRegional ? '/graphics/ux/map-pinned.svg' : '/graphics/ux/gallery-vertical.svg';
    slideInfoIcon.style.cssText = 'display:block;animation:switchModules 160ms ease-in-out forwards';
    slideProgressBar.style.cssText = `display:block;animation:progressBar ${def.duration}ms linear forwards`;

    if (def.isRegional) {
        if (domCache.regionalBumperHeader) domCache.regionalBumperHeader.textContent = def.title;

        const regionEls = [
            domCache.upNextRegionalText, domCache.upNextRegionalText1,
            domCache.upNextRegionalText2, domCache.upNextRegionalText3, domCache.upNextRegionalText4,
        ];
        upcomingRegions.forEach((name, i) => { if (regionEls[i]) regionEls[i].innerText = name; });
        for (let i = upcomingRegions.length; i < regionEls.length; i++) { if (regionEls[i]) regionEls[i].innerText = ''; }

        const marquee = domCache.regionalBumperSubtext;
        marquee.innerText = ` ${config.networkName} `.repeat(50);
        $(document).ready(function(){
            $('#national-bumper-subtext').marquee({
                duration: 9000, gap: 360, delayBeforeStart: 0,
                direction: 'left', duplicated: true, pauseOnHover: true,
            });
        });

        const randomBackgrounds = bumperBackgroundsRandom.national;
        if (randomBackgrounds?.length) {
            let bgIndex = Math.floor(Math.random() * randomBackgrounds.length);
            let selectedBG = randomBackgrounds[bgIndex];
            if (selectedBG.name.includes("Rai Praying")) {
                bgIndex = Math.floor(Math.random() * randomBackgrounds.length);
                selectedBG = randomBackgrounds[bgIndex];
            }
            console.log(logTheFrickinTime + `Selected bumper background: ${selectedBG.url}`);
            const canvas = document.getElementById('bumper-background');
            if (canvas) canvas.style.backgroundImage = `url('${selectedBG.url}')`;
            if (domCache.bumperBgTitle) domCache.bumperBgTitle.innerText = selectedBG.name || '';
            if (domCache.bumperBgSubtitle) domCache.bumperBgSubtitle.innerText = selectedBG.subtitle || '';
            if (domCache.bumperBgAuthor) domCache.bumperBgAuthor.innerText = selectedBG.author || '';
        }

        requestAnimationFrame(() => {
            domCache.regionalBumperHeader.style.animation = 'mainPresentationSlideIn 500ms ease-in-out forwards';
            domCache.regionalLocationHeader.style.animation = 'switchModules 300ms ease-in-out forwards';
            domCache.upNextRegionalText.style.animation = 'fadeInTypeBeat 1900ms ease-in-out forwards';
            domCache.upNextRegionalText1.style.animation = 'fadeInTypeBeat 2200ms ease-in-out forwards';
            domCache.upNextRegionalText2.style.animation = 'fadeInTypeBeat 2400ms ease-in-out forwards';
            domCache.upNextRegionalText3.style.animation = 'fadeInTypeBeat 2800ms ease-in-out forwards';
            domCache.upNextRegionalText4.style.animation = 'fadeInTypeBeat 3200ms ease-in-out forwards';
            domCache.regionalBumperSubtext.style.animation = 'fadeInTypeBeat 1500ms linear forwards';
        });
        setTimeout(() => {
            requestAnimationFrame(() => {
                domCache.regionalBumperHeader.style.animation = 'fadeModule 300ms ease forwards';
                domCache.regionalLocationHeader.style.animation = 'fadeModule 400ms ease forwards';
                domCache.upNextRegionalText.style.animation = 'fadeModule 500ms ease forwards';
                domCache.upNextRegionalText1.style.animation = 'fadeModule 600ms ease forwards';
                domCache.upNextRegionalText2.style.animation = 'fadeModule 800ms ease forwards';
                domCache.upNextRegionalText3.style.animation = 'fadeModule 1000ms ease forwards';
                domCache.upNextRegionalText4.style.animation = 'fadeModule 1200ms ease forwards';
                domCache.regionalBumperSubtext.style.animation = 'fadeModule 1500ms linear forwards';
            });
        }, def.duration - 1000);
        setTimeout(() => {
            $(document).ready(function(){ $('#national-bumper-subtext').marquee('destroy'); });
        }, def.duration);
    }

    slideNearEnd = setTimeout(() => {
        if (el) el.style.animation = playlistSettings.defaultAnimationOut;
        slideInfoName.style.animation = 'fadeModule 0.5s ease-in-out forwards';
        slideInfoIcon.style.animation = 'slideDown 160ms ease-in-out forwards';
    }, def.duration - 500);

    slideEnd = setTimeout(() => {
        slideInfoName.style.display = 'none';
        slideInfoName.style.animation = '';
        slideProgressBar.style.display = 'none';
        slideProgressBar.style.animation = '';
        slideInfoIcon.style.display = 'none';
        slideInfoIcon.style.animation = '';
        callback?.();
    }, def.duration);
}

function runRadarSlide() {
    const radarEl = domCache.radarDiv;
    requestAnimationFrame(() => {
        radarEl.style.display = 'block';
    });
    const onAnimEnd = () => {
        radarEl.removeEventListener('animationend', onAnimEnd);
        requestAnimationFrame(() => resizeRadar());
    };
    radarEl.addEventListener('animationend', onAnimEnd);
    setTimeout(() => {
        radarEl.removeEventListener('animationend', onAnimEnd);
        resizeRadar();
    }, 700);
    setTimeout(() => {
        requestAnimationFrame(() => {});
    }, slideDurationMS + 100);
}
