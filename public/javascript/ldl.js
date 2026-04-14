import { requestWxData } from './data.js'
import { config, locationConfig, serverConfig, weatherIcons, displayUnits } from "../config.js";
import { formatTime } from './weather.js';

const ldlPresentationSlides = {
    "0": { htmlID: "ldl-current", durationMS: 20000 },
    "1": { htmlID: "ldl-hourly", durationMS: 15000 },
    "2": { htmlID: "ldl-forecast", durationMS: 20000 },
    "3": { htmlID: "ldl-aqi", durationMS: 8000 },
    "4": { htmlID: "ldl-riseset", durationMS: 12000 },
}

let totalDuration = 0;
let totalDurationSec = 0;

for (let key in ldlPresentationSlides) {
    totalDuration += Number(ldlPresentationSlides[key].durationMS);
    totalDurationSec += Number(ldlPresentationSlides[key].durationMS) / 1000;
}

const logTheFrickinTime = () => `[ldl.js] | ${new Date().toLocaleString()} |`;

let ldlLocationIndex = 0;
let ldlSlideIndex = 0;
let iconDir = "animated"

const selectedDisplayUnits = displayUnits[serverConfig.units] || displayUnits['m'];
let endingTemp = selectedDisplayUnits.endingTemp, endingWind = selectedDisplayUnits.endingWind, endingDistance = selectedDisplayUnits.endingDistance, endingPressure = selectedDisplayUnits.endingPressure, endingCeiling = selectedDisplayUnits.endingCeiling;

const bulletinCrawlContainer = document.getElementsByClassName('ldl-bulletin-crawl')[0]

bulletinCrawlContainer.style.display = `none`

const ldlDomCache = Object.freeze({
    headlineBack: document.getElementById('ldl-bulletin-metadata-text'),
    bulletinText: document.getElementById('ldl-bulletin-text'),
    bulletinMetadataText: document.getElementById('ldl-bulletin-metadata-text'),
    locationLabel: document.getElementById('ldl-location-label'),
    progressBar: document.getElementById('ldl-location-progressbar'),
    currentTemp: document.getElementById('ldl-current-temp'),
    currentIcon: document.getElementById('ldl-current-icon'),
    currentCondition: document.getElementById('ldl-current-condition'),
    currentWind: document.getElementById('ldl-current-wind-value'),
    currentHumidity: document.getElementById('ldl-current-humidity-value'),
    currentDewpoint: document.getElementById('ldl-current-dewpoint-value'),
    currentPressure: document.getElementById('ldl-current-pressure-value'),
    currentVisib: document.getElementById('ldl-current-visibility-value'),
    currentCeiling: document.getElementById('ldl-current-ceiling-value'),
    currentFeelsLike: document.getElementById('ldl-current-feelslike-value'),
    currentModule1: document.getElementById('ldl-current-module1'),
    currentModule2: document.getElementById('ldl-current-module2'),
    forecast0Name: document.getElementById('ldl-forecast-day0-name'),
    forecast0Cond: document.getElementById('ldl-forecast-day0-condition'),
    forecast0Icon: document.getElementById('ldl-day0-icon'),
    forecast0Temp: document.getElementById('ldl-forecast-day0-temp'),
    forecast0Precip: document.getElementById('ldl-forecast-day0-pop-value'),
    forecast1Name: document.getElementById('ldl-forecast-day1-name'),
    forecast1Cond: document.getElementById('ldl-forecast-day1-condition'),
    forecast1Icon: document.getElementById('ldl-day1-icon'),
    forecast1Temp: document.getElementById('ldl-forecast-day1-temp'),
    forecast1Precip: document.getElementById('ldl-forecast-day1-pop-value'),
    forecast0Container: document.getElementById('ldl-forecast-day0-container'),
    forecast1Container: document.getElementById('ldl-forecast-day1-container'),
    hourlyGroup: {
        ldlHourlyTime0: document.getElementById('ldl-hourly-time0'),
        ldlHourlyIcon0: document.getElementById('ldl-hourly-icon0'),
        ldlHourlyTemp0: document.getElementById('ldl-hourly-temp0'),
        ldlHourlyCondition0: document.getElementById('ldl-hourly-condition0'),
        ldlHourlyPrecip0Group: document.getElementById('ldl-hourly-period0-precip-group'),
        ldlHourlyPrecipIcon0: document.getElementById('ldl-hourly-precip-icon0'),
        ldlHourlyPrecip0: document.getElementById('ldl-hourly-precip0'),
        ldlHourlyTime1: document.getElementById('ldl-hourly-time1'),
        ldlHourlyIcon1: document.getElementById('ldl-hourly-icon1'),
        ldlHourlyTemp1: document.getElementById('ldl-hourly-temp1'),
        ldlHourlyCondition1: document.getElementById('ldl-hourly-condition1'),
        ldlHourlyPrecip1Group: document.getElementById('ldl-hourly-period1-precip-group'),
        ldlHourlyPrecipIcon1: document.getElementById('ldl-hourly-precip-icon1'),
        ldlHourlyPrecip1: document.getElementById('ldl-hourly-precip1'),
        ldlHourlyTime2: document.getElementById('ldl-hourly-time2'),
        ldlHourlyIcon2: document.getElementById('ldl-hourly-icon2'),
        ldlHourlyTemp2: document.getElementById('ldl-hourly-temp2'),
        ldlHourlyCondition2: document.getElementById('ldl-hourly-condition2'),
        ldlHourlyPrecip2Group: document.getElementById('ldl-hourly-period2-precip-group'),
        ldlHourlyPrecipIcon2: document.getElementById('ldl-hourly-precip-icon2'),
        ldlHourlyPrecip2: document.getElementById('ldl-hourly-precip2'),
        ldlHourlyTime3: document.getElementById('ldl-hourly-time3'),
        ldlHourlyIcon3: document.getElementById('ldl-hourly-icon3'),
        ldlHourlyTemp3: document.getElementById('ldl-hourly-temp3'),
        ldlHourlyCondition3: document.getElementById('ldl-hourly-condition3'),
        ldlHourlyPrecip3Group: document.getElementById('ldl-hourly-period3-precip-group'),
        ldlHourlyPrecipIcon3: document.getElementById('ldl-hourly-precip-icon3'),
        ldlHourlyPrecip3: document.getElementById('ldl-hourly-precip3'),
        ldlHourlyTime4: document.getElementById('ldl-hourly-time4'),
        ldlHourlyIcon4: document.getElementById('ldl-hourly-icon4'),
        ldlHourlyTemp4: document.getElementById('ldl-hourly-temp4'),
        ldlHourlyCondition4: document.getElementById('ldl-hourly-condition4'),
        ldlHourlyPrecip4Group: document.getElementById('ldl-hourly-period4-precip-group'),
        ldlHourlyPrecipIcon4: document.getElementById('ldl-hourly-precip-icon4'),
        ldlHourlyPrecip4: document.getElementById('ldl-hourly-precip4'),
        ldlHourlyTime5: document.getElementById('ldl-hourly-time5'),
        ldlHourlyIcon5: document.getElementById('ldl-hourly-icon5'),
        ldlHourlyTemp5: document.getElementById('ldl-hourly-temp5'),
        ldlHourlyCondition5: document.getElementById('ldl-hourly-condition5'),
        ldlHourlyPrecip5Group: document.getElementById('ldl-hourly-period5-precip-group'),
        ldlHourlyPrecipIcon5: document.getElementById('ldl-hourly-precip-icon5'),
        ldlHourlyPrecip5: document.getElementById('ldl-hourly-precip5'),
    },
    aqiStatus: document.getElementById('ldl-aqi-status'),
    aqiIndex: document.getElementById('ldl-aqi-index'),
    aqiPrimaryPollutant: document.getElementById('ldl-aqi-primarypollutant'),
    ldlCurrent: document.getElementById('ldl-current'),
    ldlHourly: document.getElementById('ldl-hourly'),
    ldlForecast: document.getElementById('ldl-forecast'),
    ldlAqi: document.getElementById('ldl-aqi'),
    ldlAlmanac: document.getElementById('ldl-riseset'),
    riseTimeLabel: document.getElementById('ldl-rise-time-label'),
    setTimeLabel: document.getElementById('ldl-set-time-label'),
    sunProgressArch: document.getElementById('ldl-sun-progressarch'),
    sunArchProgress: document.getElementById('ldl-sun-arch-progress'),
    sunIndicator: document.getElementById('ldl-sun-indicator'),
    almanacSunrise: document.getElementById('ldl-riseset-sunrise'),
    almanacSunset: document.getElementById('ldl-riseset-sunset'),
    ldlMoonPhaseIcon1: document.getElementById('ldl-moon-phase-icon1'),
    ldlMoonPhaseIcon2: document.getElementById('ldl-moon-phase-icon2'),
    ldlMoonPhaseIcon3: document.getElementById('ldl-moon-phase-icon3'),
    ldlMoonPhaseIcon4: document.getElementById('ldl-moon-phase-icon4'),
    ldlMoonPhaseName1: document.getElementById('ldl-moon-phase-name1'),
    ldlMoonPhaseName2: document.getElementById('ldl-moon-phase-name2'),
    ldlMoonPhaseName3: document.getElementById('ldl-moon-phase-name3'),
    ldlMoonPhaseName4: document.getElementById('ldl-moon-phase-name4'),
    ldlMoonPhaseIllumination1: document.getElementById('ldl-moon-phase-illumination1'),
    ldlMoonPhaseIllumination2: document.getElementById('ldl-moon-phase-illumination2'),
    ldlMoonPhaseIllumination3: document.getElementById('ldl-moon-phase-illumination3'),
    ldlMoonPhaseIllumination4: document.getElementById('ldl-moon-phase-illumination4'),
});






function initializeMarquee(retries = 3) {
  if (typeof $ === 'undefined' || typeof $.fn.marquee === 'undefined') {
    if (retries > 0) {
      setTimeout(() => initializeMarquee(retries - 1), 100);
    }
    return;
  }

  try {
    const $element = $('#ldl-bulletin-text');
    $element.marquee('destroy');
    $element.css('transform', 'none');
    
    setTimeout(() => {
      $element.marquee({
        speed: 180,
        gap: 100,
        direction: 'left',
        duplicated: false,
        pauseOnHover: false,
        startVisible: true,
        delayBeforeStart: 0
      });
    }, 100);
  } catch (error) {
    console.error('[initializeMarquee] Error:', error);
    if (retries > 0) {
      setTimeout(() => initializeMarquee(retries - 1), 200);
    }
  }
}

export function requestBulletinCrawl(text, alertCategory, headlineText, country, colorCode) {
  console.log('[requestBulletinCrawl] Called with:', { text, alertCategory, headlineText, country, colorCode });
  bulletinCrawlContainer.style.display = `flex`
  const beep = new Audio('../audio/beep.ogg');
  ldlDomCache.bulletinText.innerHTML = text;
  ldlDomCache.bulletinMetadataText.innerHTML = `
    <span class="bulletin-icon">⚠</span>
    <span class="bulletin-metadata-label">${headlineText || 'ACTIVE ALERT'}</span>
  `;

  initializeMarquee();

  beep.play();

  if (country === "US") {
    switch (alertCategory) {
      case "W":
        ldlDomCache.headlineBack.style.background = "rgba(188, 56, 33, 0.51)"
        break;
      case "A":
        ldlDomCache.headlineBack.style.background = "rgba(247, 231, 136, 0.51)"
        break;
      case "S":
        ldlDomCache.headlineBack.style.background = "rgba(87, 170, 87, 0.51)"
        break;
      case "Y":
        ldlDomCache.headlineBack.style.background = "rgba(221, 115, 34, 0.51)"
        break;
    }
  } else if (country === "CA") {
    switch (colorCode) {
      case "Orange":
        ldlDomCache.headlineBack.style.background = "rgba(221, 115, 34, 0.51)"
        break;
      case "Yellow":
        ldlDomCache.headlineBack.style.background = "rgba(247, 231, 136, 0.51)"
        break;
      case "Red":
        ldlDomCache.headlineBack.style.background = "rgba(189, 59, 29, 0.51)"
        break;
      default:
        ldlDomCache.headlineBack.style.background = "rgba(87, 170, 87, 0.51)"
        break;
    }
  }
}

export function cancelBulletinCrawl() {
  bulletinCrawlContainer.style.display = `none`
}

let currentLDLData = null;

async function fetchLDLData(locationName) {
    try {
        if (config.verboseLogging === true) {
            console.log(`${logTheFrickinTime()} Fetching LDL data for: ${locationName}`)
        }
        
        const wxData = await requestWxData(locationName, "ldl");
        
        if (wxData && wxData.weather) {
            currentLDLData = {
                current: wxData.weather["v3-wx-observations-current"] ?? null,
                hourly: wxData.weather["v3-wx-forecast-hourly-2day"] ?? null,
                forecast: wxData.weather["v3-wx-forecast-daily-7day"] ?? wxData.weather["v3-wx-forecast-daily-3day"] ?? null,
                aqi: wxData.weather["v3-wx-globalAirQuality"] ?? null,
            };
            
            if (config.verboseLogging === true) {
                console.log(`${logTheFrickinTime()} Successfully fetched LDL data for ${locationName}`, currentLDLData)
            }
            
            return true;
        } else {
            console.warn(`${logTheFrickinTime()} No weather data returned for ${locationName}`);
            return false;
        }
    } catch (error) {
        console.error(`${logTheFrickinTime()} Error fetching LDL data for ${locationName}:`, error);
        return false;
    }
}

async function LDLData() {
    try {
        if (config.staticIcons === true) {
            iconDir = "static"
        } else {
            iconDir = "animated"
        }

        const ldlLocations = locationConfig.ldlLocations;
        
        if (!ldlLocations || ldlLocations.length === 0) {
            console.warn(`${logTheFrickinTime()} No LDL locations configured!`);
            return;
        }

        if (ldlLocationIndex >= ldlLocations.length) {
            ldlLocationIndex = 0;
        }

        const locationName = ldlLocations[ldlLocationIndex];
        
        if (ldlDomCache.locationLabel) {
            ldlDomCache.locationLabel.textContent = `Weather for ${locationName}`
        }

        const success = await fetchLDLData(locationName);
        
        if (!success || !currentLDLData || !currentLDLData.current) {
            console.warn(`${logTheFrickinTime()} No valid data for ${locationName}, skipping...`);
            return;
        }

        if (config.verboseLogging === true) {
            console.log(`${logTheFrickinTime()} Current LDL location: ${locationName}`)
        }

        appendLDLCurrent();
        appendLDLForecast();
        appendLDLHourly();
        appendLDLAirQuality();
        appendLDLAlmanac();

    } catch (error) {
        console.error(`${logTheFrickinTime()} Error in LDLData:`, error);
    }
}

function appendLDLCurrent() {
    if (!currentLDLData || !currentLDLData.current) return;
    
    const current = currentLDLData.current;
    const c = ldlDomCache;

    if (c.currentTemp) c.currentTemp.textContent = `${current.temperature}${endingTemp}`
    if (c.currentCondition) c.currentCondition.textContent = current.wxPhraseMedium ?? current.wxPhraseLong ?? "N/A"
    if (c.currentWind) c.currentWind.textContent = `${current.windDirectionCardinal ?? "N/A"}, ${current.windSpeed ?? 0}${endingWind}`
    if (c.currentHumidity) c.currentHumidity.textContent = `${current.relativeHumidity ?? 0}%`
    if (c.currentDewpoint) c.currentDewpoint.textContent = `${current.temperatureDewPoint ?? 0}${endingTemp}`
    if (c.currentPressure) c.currentPressure.textContent = `${current.pressureAltimeter ?? 0}${endingPressure}`
    if (c.currentVisib) c.currentVisib.textContent = `${Math.round(current.visibility ?? 0)}${endingDistance}`
    if (c.currentFeelsLike) c.currentFeelsLike.textContent = `${current.temperatureFeelsLike ?? current.temperature}${endingTemp}`

    if (c.currentIcon) {
        const iconCode = current.iconCode;
        const dayOrNight = current.dayOrNight;
        const iconPath = weatherIcons[iconCode] ? weatherIcons[iconCode][dayOrNight === "D" ? 0 : 1] : 'not-available.svg'
        c.currentIcon.src = `/graphics/${iconDir}/${iconPath}`
    }
    
    if (c.currentCeiling) {
        const ceiling = current.cloudCeiling;
        c.currentCeiling.textContent = (ceiling === null || ceiling === undefined) 
            ? "Unlimited" 
            : `${ceiling}${endingCeiling}`
    }
}

function appendLDLHourly() {
    if (!currentLDLData || !currentLDLData.hourly) return;

    const hourly = currentLDLData.hourly;
    const c = ldlDomCache.hourlyGroup;

    for (let i = 0; i < 6; i++) {
        if (c[`ldlHourlyTime${i}`]) c[`ldlHourlyTime${i}`].textContent = formatTime(hourly.validTimeLocal[i]);
        if (c[`ldlHourlyTemp${i}`]) c[`ldlHourlyTemp${i}`].textContent = `${hourly.temperature[i]}°`;
        if (c[`ldlHourlyCondition${i}`]) c[`ldlHourlyCondition${i}`].textContent = hourly.wxPhraseShort[i] ?? "N/A";
        
        if (c[`ldlHourlyIcon${i}`]) {
            const iconCode = hourly.iconCode[i];
            const dayOrNight = hourly.dayOrNight[i];
            const iconPath = weatherIcons[iconCode] ? weatherIcons[iconCode][dayOrNight === "D" ? 0 : 1] : 'not-available.svg';
            c[`ldlHourlyIcon${i}`].src = `/graphics/${iconDir}/${iconPath}`;
        }
        /*
        const precip = hourly.precipChance[i] ?? 0;
        const precipType = hourly.precipType[i] ?? "precip";
        if (c[`ldlHourlyPrecip${i}`]) c[`ldlHourlyPrecip${i}`].textContent = `${precip}%`;
        if (c[`ldlHourlyPrecip${i}Group`]) {
            c[`ldlHourlyPrecip${i}Group`].style.visibility = precip > 0 ? 'visible' : 'hidden';
        }
        if (c[`ldlHourlyPrecipIcon${i}`]) {
            const rainIconPath = `/graphics/${iconDir}/rain.svg`;
            const snowIconPath = `/graphics/${iconDir}/snow.svg`;

            if (precipType === "precip" || precipType === "rain") {
                c[`ldlHourlyPrecipIcon${i}`].style.backgroundImage = rainIconPath;
            }
            if (precipType === "snow") {
                c[`ldlHourlyPrecipIcon${i}`].style.backgroundImage = snowIconPath;
            }
        }
        */
    }
}

function appendLDLForecast() {
    if (!currentLDLData || !currentLDLData.forecast) return;
    
    const forecast = currentLDLData.forecast;
    const c = ldlDomCache;

    if (!forecast.daypart || !forecast.daypart[0]) return;
    
    const daypart = forecast.daypart[0];
    
    if (c.forecast0Name) c.forecast0Name.textContent = daypart.daypartName[0] ?? daypart.daypartName[1] ?? "Today"
    if (c.forecast0Cond) c.forecast0Cond.textContent = daypart.wxPhraseShort[0] ?? daypart.wxPhraseShort[1] ?? "N/A"
    if (c.forecast0Temp) c.forecast0Temp.textContent = `${daypart.temperature[0] ?? daypart.temperature[1] ?? "--"}°`
    if (c.forecast0Precip) c.forecast0Precip.textContent = `${daypart.precipChance[0] ?? daypart.precipChance[1] ?? 0}%`

    if (c.forecast0Icon) {
        const dayOneIconCode = daypart.iconCode[0] ?? daypart.iconCode[1];
        const dayOrNight = daypart.dayOrNight[0] ?? daypart.dayOrNight[1];
        const iconPath = weatherIcons[dayOneIconCode] ? weatherIcons[dayOneIconCode][dayOrNight === "D" ? 0 : 1] : 'not-available.svg'
        c.forecast0Icon.src = `/graphics/${iconDir}/${iconPath}`
    }

    if (daypart.daypartName[0] === null) {
        if (c.forecast1Name) c.forecast1Name.textContent = daypart.daypartName[2] ?? "Tomorrow"
        if (c.forecast1Cond) c.forecast1Cond.textContent = daypart.wxPhraseShort[2] ?? "N/A"
        if (c.forecast1Temp) c.forecast1Temp.textContent = `${daypart.temperature[2] ?? "--"}°`
        if (c.forecast1Precip) c.forecast1Precip.textContent = `${daypart.precipChance[2] ?? 0}%`

        if (c.forecast1Icon) {
            const dayTwoIconCode = daypart.iconCode[2]
            const dayOrNight = daypart.dayOrNight[2]
            const iconPath = weatherIcons[dayTwoIconCode] ? weatherIcons[dayTwoIconCode][dayOrNight === "D" ? 0 : 1] : 'not-available.svg'
            c.forecast1Icon.src = `/graphics/${iconDir}/${iconPath}`
        }
    } else {
        if (c.forecast1Name) c.forecast1Name.textContent = daypart.daypartName[1] ?? "Tonight"
        if (c.forecast1Cond) c.forecast1Cond.textContent = daypart.wxPhraseShort[1] ?? "N/A"
        if (c.forecast1Temp) c.forecast1Temp.textContent = `${daypart.temperature[1] ?? "--"}°`
        if (c.forecast1Precip) c.forecast1Precip.textContent = `${daypart.precipChance[1] ?? 0}%`

        if (c.forecast1Icon) {
            const dayTwoIconCode = daypart.iconCode[1]
            const dayOrNight = daypart.dayOrNight[1]
            const iconPath = weatherIcons[dayTwoIconCode] ? weatherIcons[dayTwoIconCode][dayOrNight === "D" ? 0 : 1] : 'not-available.svg'
            c.forecast1Icon.src = `/graphics/${iconDir}/${iconPath}`
        }
    }
}

function appendLDLAirQuality() {
    const c = ldlDomCache;
    
    if (!currentLDLData || !currentLDLData.aqi || !currentLDLData.aqi.globalairquality) {
        if (c.aqiStatus) c.aqiStatus.textContent = "N/A"
        if (c.aqiIndex) c.aqiIndex.textContent = "--"
        if (c.aqiPrimaryPollutant) c.aqiPrimaryPollutant.textContent = "N/A"
        return;
    }
    
    const aqi = currentLDLData.aqi.globalairquality;

    if (c.aqiStatus) {
        c.aqiStatus.style.color = `#${aqi.airQualityCategoryIndexColor ?? 'FFFFFF'}`
        c.aqiStatus.textContent = aqi.airQualityCategory ?? "N/A"
    }
    if (c.aqiIndex) c.aqiIndex.textContent = aqi.airQualityCategoryIndex ?? "--"
    if (c.aqiPrimaryPollutant) c.aqiPrimaryPollutant.textContent = aqi.primaryPollutant ?? "N/A"
}

function appendLDLAlmanac() {
    const c = ldlDomCache;

    const now = new Date();
    const rise = new Date(currentLDLData.current.sunriseTimeLocal);
    const set = new Date(currentLDLData.current.sunsetTimeLocal);

    let riseTimeLocal;
    let setTimeLocal;
        
    const totalDaylight = set.getTime() - rise.getTime();
    const elapsed = now.getTime() - rise.getTime();
        
    let progress = elapsed / totalDaylight;
    let isNight = (now < rise || now > set);

    if (isNight) {
        if (c.riseTimeLabel) c.riseTimeLabel.textContent = "Moonrise";
        if (c.setTimeLabel) c.setTimeLabel.textContent = "Moonset";

        const moonRises = (currentLDLData.forecast.moonriseTimeLocal || []).map(t => new Date(t));
        const moonSets = (currentLDLData.forecast.moonsetTimeLocal || []).map(t => new Date(t));
        
        const events = [];
        moonRises.forEach(t => events.push({type: 'rise', time: t}));
        moonSets.forEach(t => events.push({type: 'set', time: t}));
        
        events.sort((a, b) => a.time - b.time);
        
        const lastEvent = events.filter(e => e.time <= now).pop();
        
        if (lastEvent && lastEvent.type === 'rise') {
            const currentMoonRise = lastEvent.time;
            const currentMoonSet = events.find(e => e.time > now && e.type === 'set');
            
            if (currentMoonSet) {
                const totalMoonTime = currentMoonSet.time.getTime() - currentMoonRise.getTime();
                const moonElapsed = now.getTime() - currentMoonRise.getTime();
                progress = moonElapsed / totalMoonTime;
                
                riseTimeLocal = formatTime(currentMoonRise.toISOString());
                setTimeLocal = formatTime(currentMoonSet.time.toISOString());
            } else {
                riseTimeLocal = formatTime(currentLDLData.forecast.moonriseTimeLocal[0]);
                setTimeLocal = formatTime(currentLDLData.forecast.moonsetTimeLocal[0]);
                progress = 0;
            }
        } else {
            riseTimeLocal = formatTime(currentLDLData.forecast.moonriseTimeLocal[0]);
            setTimeLocal = formatTime(currentLDLData.forecast.moonsetTimeLocal[0]);
            progress = 0;
        }
    } else {
        if (c.riseTimeLabel) c.riseTimeLabel.textContent = "Sunrise";
        if (c.setTimeLabel) c.setTimeLabel.textContent = "Sunset";
        
        riseTimeLocal = formatTime(currentLDLData.current.sunriseTimeLocal);
        setTimeLocal = formatTime(currentLDLData.current.sunsetTimeLocal);
    }
        
    if (progress < 0) progress = 0;
    if (progress > 1) progress = 1;

    if (currentLDLData && currentLDLData.current) {
        c.almanacSunrise.textContent = riseTimeLocal || "N/A";
        c.almanacSunset.textContent = setTimeLocal || "N/A";
    }

    const radiusX = 56;
    const radiusY = 46;
    const centerX = 60;
    const centerY = 50;
    
    const angleRad = Math.PI * (1 - progress);
    const sunX = centerX + radiusX * Math.cos(angleRad);
    const sunY = centerY - radiusY * Math.sin(angleRad);
    if (c.sunIndicator) {
        c.sunIndicator.style.left = `${sunX}px`;
        c.sunIndicator.style.top = `${sunY}px`;
    }

    const phaseDays = {
        "N": 0, "WXC": 3.7, "FQ": 7.4, "WXG": 11.1,
        "F": 14.8, "WNG": 18.5, "LQ": 22.1, "WNC": 25.8
    };

    const phaseDataCode = currentLDLData.forecast.moonPhaseCode
    const currentCode = phaseDataCode[0];

    const phaseToSVG = {
        "WNG": "moon-waning-gibbous.svg",
        "WXC": "moon-waxing-crescent.svg",
        "FQ": "moon-first-quarter.svg",
        "WNC": "moon-waning-crescent.svg",
        "LQ": "moon-last-quarter.svg",
        "F": "moon-full.svg",
        "WXG": "moon-waxing-gibbous.svg",
        "N": "moon-new.svg"
    }

    const majorPhases = [
        { code: "FQ", day: 7.4, name: "First Quarter", icon: "moon-first-quarter" },
        { code: "F", day: 14.8, name: "Full Moon", icon: "moon-full" },
        { code: "LQ", day: 22.1, name: "Last Quarter", icon: "moon-last-quarter" },
        { code: "N", day: 0, name: "New Moon", icon: "moon-new" }
    ];

    if (c.sunArchProgress) {
        const progressPercent = progress * 100;
        c.sunArchProgress.style.setProperty('--sun-progress', `${progressPercent}%`);
    }
    if (c.sunProgressArch) {
        if (isNight) {
            c.sunProgressArch.classList.add('night-mode');
            c.sunIndicator.style.background = `url('/graphics/${iconDir}/${phaseToSVG[currentCode]}')`;
            c.riseTimeLabel.textContent = "moonrise";
            c.setTimeLabel.textContent = "moonset";
        } else {
            c.sunProgressArch.classList.remove('night-mode');
            c.sunIndicator.style.background = `url('/graphics/${iconDir}/clear-day.svg')`;
            c.riseTimeLabel.textContent = "sunrise";
            c.setTimeLabel.textContent = "sunset";
        }
    }

    const moonPhaseNames = currentLDLData.forecast.moonPhase;
    const moonPhaseCodes = currentLDLData.forecast.moonPhaseCode;
    
    function getPhaseInfo(index, labelOverride) {
        if (!moonPhaseNames || !moonPhaseNames[index]) return null;

        const date = new Date();
        date.setDate(date.getDate() + index);
        const month = date.toLocaleString('default', { month: 'short' });
        const day = date.getDate();
        const label = labelOverride || `${month} ${day}`;
        
        const code = moonPhaseCodes[index];
        const iconName = phaseToSVG[code] || "moon-full.svg";

        return {
            name: moonPhaseNames[index],
            date: label,
            icon: `/graphics/animated/${iconName}`,
            code: code,
            dayIndex: index
        };
    }

    const apiPhases = [];

    const slot1 = getPhaseInfo(0, "Tonight");
    if (slot1) apiPhases.push(slot1);

    let slot2 = null;
    if (slot1) {
        for (let i = 1; i < moonPhaseCodes.length; i++) {
            if (moonPhaseCodes[i] !== slot1.code) {
                slot2 = getPhaseInfo(i);
                break;
            }
        }
        if (!slot2 && moonPhaseNames[1]) {
             slot2 = getPhaseInfo(1);
        }
    }
    
    if (slot2) apiPhases.push(slot2);

    const lastApiPhase = slot2 || slot1;
    let baseAge = 0;
    let baseDateOffset = 0;

    if (lastApiPhase) {
        baseAge = phaseDays[lastApiPhase.code] !== undefined ? phaseDays[lastApiPhase.code] : 0;
        baseDateOffset = lastApiPhase.dayIndex;
    }

    const nextPhases = [...majorPhases].map(p => {
        let diff = p.day - baseAge;
        if (diff <= 1.5) diff += 29.53;
        return { ...p, diff };
    }).sort((a, b) => a.diff - b.diff);

    const predictedPhases = [];
    for (let i = 0; i < 2; i++) {
        const p = nextPhases[i];
        const daysToAdd = baseDateOffset + p.diff;
        const date = new Date();
        date.setDate(date.getDate() + Math.round(daysToAdd));
        const month = date.toLocaleString('default', { month: 'short' });
        const day = date.getDate();
        
        predictedPhases.push({
            name: p.name,
            date: `${month} ${day}`,
            icon: `/graphics/animated/${p.icon}.svg`
        });
    }

    const finalPhases = [...apiPhases, ...predictedPhases];

    if (c.ldlMoonPhaseName1 && finalPhases[0]) c.ldlMoonPhaseName1.textContent = finalPhases[0].name;
    if (c.ldlMoonPhaseIllumination1 && finalPhases[0]) c.ldlMoonPhaseIllumination1.textContent = finalPhases[0].date;
    if (c.ldlMoonPhaseIcon1 && finalPhases[0]) c.ldlMoonPhaseIcon1.src = finalPhases[0].icon;

    if (c.ldlMoonPhaseName2 && finalPhases[1]) c.ldlMoonPhaseName2.textContent = finalPhases[1].name;
    if (c.ldlMoonPhaseIllumination2 && finalPhases[1]) c.ldlMoonPhaseIllumination2.textContent = finalPhases[1].date;
    if (c.ldlMoonPhaseIcon2 && finalPhases[1]) c.ldlMoonPhaseIcon2.src = finalPhases[1].icon;

    if (c.ldlMoonPhaseName3 && finalPhases[2]) c.ldlMoonPhaseName3.textContent = finalPhases[2].name;
    if (c.ldlMoonPhaseIllumination3 && finalPhases[2]) c.ldlMoonPhaseIllumination3.textContent = finalPhases[2].date;
    if (c.ldlMoonPhaseIcon3 && finalPhases[2]) c.ldlMoonPhaseIcon3.src = finalPhases[2].icon;

    if (c.ldlMoonPhaseName4 && finalPhases[3]) c.ldlMoonPhaseName4.textContent = finalPhases[3].name;
    if (c.ldlMoonPhaseIllumination4 && finalPhases[3]) c.ldlMoonPhaseIllumination4.textContent = finalPhases[3].date;
    if (c.ldlMoonPhaseIcon4 && finalPhases[3]) c.ldlMoonPhaseIcon4.src = finalPhases[3].icon;
}

function showLocationLabel() {
    const label = ldlDomCache.locationLabel;
    if (!label) return;
    label.style.display = 'block';
    label.style.animation = 'slideIn 1s ease-out';
}

function hideLocationLabel() {
    const label = ldlDomCache.locationLabel;
    if (!label) return;
    label.style.animation = 'slideOut 1s ease-out';

    setTimeout(() => {
        label.style.display = 'none';
    }, 300);
}

function runCurrentSlide() {
    const module1 = ldlDomCache.currentModule1;
    const module2 = ldlDomCache.currentModule2;

    if (!module1 || !module2) return;

    module1.style.display = 'flex';
    module2.style.display = 'none';

    const currentSlide = ldlPresentationSlides[0];
    const halfDuration = currentSlide.durationMS / 2;

    setTimeout(() => {
        module1.style.animation = 'fadeModule 0.2s ease-out';

        setTimeout(() => {
            module1.style.display = 'none';
            module1.style.animation = '';
            module2.style.display = 'flex';
            module2.style.animation = 'switchModules 0.5s ease-out';
        }, 200);

    }, halfDuration - 300);
}

function runForecastSlide() {
    const day0 = ldlDomCache.forecast0Container;
    const day1 = ldlDomCache.forecast1Container;

    if (!day0 || !day1) return;

    day0.style.display = 'flex';
    day1.style.display = 'none';

    const forecastSlide = ldlPresentationSlides[2];
    const halfDuration = forecastSlide.durationMS / 2;

    setTimeout(() => {
        day0.style.animation = 'fadeModule 0.2s ease-out';

        setTimeout(() => {
            day0.style.display = 'none';
            day0.style.animation = '';
            day1.style.display = 'flex';
            day1.style.animation = 'switchModules 0.5s ease-out';
        }, 100);

    }, halfDuration - 300);
}

function triggerExitAnimation(slideID) {
    const slideElement = document.getElementById(slideID);
    if (!slideElement) return;

    slideElement.style.animation = 'slideOut 1s ease-out';

    setTimeout(() => {
        slideElement.style.display = 'none';
    }, 200);
}

const slideElementMap = {
    'ldl-current': () => ldlDomCache.ldlCurrent,
    'ldl-forecast': () => ldlDomCache.ldlForecast,
    'ldl-aqi': () => ldlDomCache.ldlAqi,
    'ldl-riseset': () => ldlDomCache.ldlAlmanac,
};

function showLDLSlide() {
    const slide = ldlPresentationSlides[ldlSlideIndex];
    const duration = slide.durationMS;

    if (config.verboseLogging === true) {
        console.log(`${logTheFrickinTime()} Showing LDL slide: ${slide.htmlID} for ${duration}ms`)             
    }
    
    const slideElement = slideElementMap[slide.htmlID]?.() || document.getElementById(slide.htmlID);
    if (!slideElement) {
        console.warn(`${logTheFrickinTime()} LDL slide element not found: ${slide.htmlID}`);
        setTimeout(nextLDLSlide, 2000);
        return;
    }

    slideElement.style.cssText = 'display:block;animation:slideIn 1s ease-out';

    if (slide.htmlID === 'ldl-current') {
        runCurrentSlide();
    }

    if (slide.htmlID === 'ldl-forecast') {
        runForecastSlide();
    }

    if (ldlSlideIndex === Object.keys(ldlPresentationSlides).length - 1) {
        setTimeout(() => hideLocationLabel(), duration - 1000);
    }

    setTimeout(() => triggerExitAnimation(slide.htmlID), duration - 1000);

    setTimeout(() => {
        nextLDLSlide();
    }, duration)
}

function nextLDLSlide() {
    ldlSlideIndex = (ldlSlideIndex + 1) % Object.keys(ldlPresentationSlides).length;
    
    if (ldlSlideIndex === 0) {
        nextLDLLocation();
    } else {
        showLDLSlide();
    }
}

async function nextLDLLocation() {
    const ldlLocations = locationConfig.ldlLocations;
    
    if (!ldlLocations || ldlLocations.length === 0) {
        console.warn(`${logTheFrickinTime()} No LDL locations configured!`);
        return;
    }

    ldlLocationIndex = (ldlLocationIndex + 1) % ldlLocations.length;

    showLocationLabel();
    runProgressBar();

    ldlSlideIndex = 0;

    await LDLData();
    showLDLSlide();
}

let progressBarTimeout = null;

function runProgressBar() {
    const progressBar = ldlDomCache.progressBar;
    if (!progressBar) return;

    if (progressBarTimeout) {
        clearTimeout(progressBarTimeout);
        progressBarTimeout = null;
    }

    progressBar.style.animation = 'none';
    progressBar.style.display = 'block';
    void progressBar.offsetWidth;
    progressBar.style.animation = `ldlProgressBar ${totalDurationSec}s linear`;

    progressBarTimeout = setTimeout(() => {
        progressBar.style.display = 'none';
        progressBar.style.animation = 'none';
        progressBarTimeout = null;
    }, totalDuration);
}

export async function runInitialLDL() {
    const ldlLocations = locationConfig.ldlLocations;
    
    if (!ldlLocations || ldlLocations.length === 0) {
        console.warn(`${logTheFrickinTime()} No LDL locations configured! LDL will not run.`);
        return;
    }

    if (config.verboseLogging === true) {
        console.log(`${logTheFrickinTime()} Starting LDL presentation`);
        console.log(`${logTheFrickinTime()} Total Duration (ms): ${totalDuration}`);
        console.log(`${logTheFrickinTime()} Total Duration (sec): ${totalDurationSec}`);
        console.log(`${logTheFrickinTime()} LDL Locations:`, ldlLocations);
    }

    ldlLocationIndex = 0;
    ldlSlideIndex = 0;

    showLocationLabel();
    runProgressBar();
    
    await LDLData();
    showLDLSlide();
}