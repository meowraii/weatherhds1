const logTheFrickinTime = `[vocallocal.js] | ${new Date().toLocaleString()} |`
import { config } from '../config.js';

const slideClipMap = new Map()

const WEATHER_TERM_DICTIONARY = [
    [/\btstms?\b/gi, 'thunderstorms'],
    [/\btstm\b/gi, 'thunderstorm'],
    [/\bthdr\b/gi, 'thunder'],
    [/\bthndr\b/gi, 'thunder'],
    [/\bt-?storms?\b/gi, 'thunderstorms'],
    [/\bsvr\b/gi, 'severe'],
    [/\bwx\s+alerts?\b/gi, 'weather alerts'],
    [/\bshwrs?\b/gi, 'showers'],
    [/\bflrr?ys?\b/gi, 'flurries'],
    [/\bptly\b/gi, 'partly'],
    [/\bmstly\b/gi, 'mostly'],
    [/\bcldy\b/gi, 'cloudy'],
    [/\bp\.\s?cloudy\b/gi, 'partly cloudy'],
    [/\bm\.\s?cloudy\b/gi, 'mostly cloudy'],
    [/\bovcst\b/gi, 'overcast'],
    [/\bclrg\b/gi, 'clearing'],
    [/\bpcpn\b/gi, 'precipitation'],
    [/\bpop\b/gi, 'chance of precipitation'],
    [/\bwx\b/gi, 'weather'],
    [/\baqi\b/gi, 'air quality index'],
    [/\buv\b/gi, 'ultraviolet'],
    [/\bvis\b/gi, 'visibility'],
    [/\bhum\b/gi, 'humidity'],
    [/\bpres\b/gi, 'pressure'],
    [/\bw\//gi, 'with '],
    [/\bkm\/h\b/gi, 'kilometers per hour'],
    [/\bmi\/h\b/gi, 'miles per hour'],
    [/\bm\/s\b/gi, 'meters per second'],
    [/\bmph\b/gi, 'miles per hour'],
    [/\bmm\b/gi, 'millimeters'],
    [/\bcm\b/gi, 'centimeters'],
    [/\bmi\b/gi, 'miles'],
    [/\bft\b/gi, 'feet'],
    [/\bmb\b/gi, 'millibars'],
    [/\bhg\b/gi, 'inches of mercury'],
    [/\bhpa\b/gi, 'hectopascals'],
    [/\bca\b/gi, 'Canada'],
    [/\bus\b/gi, 'United States'],
    [/\busa\b/gi, 'United States'],
    [/,\s*SK\b/g, ', Saskatchewan'],
    [/,\s*AB\b/g, ', Alberta'],
    [/,\s*BC\b/g, ', British Columbia'],
    [/,\s*MB\b/g, ', Manitoba'],
    [/,\s*ON\b/g, ', Ontario'],
    [/,\s*QC\b/g, ', Quebec'],
    [/,\s*NB\b/g, ', New Brunswick'],
    [/,\s*NS\b/g, ', Nova Scotia'],
    [/,\s*NL\b/g, ', Newfoundland and Labrador'],
    [/,\s*PE\b/g, ', Prince Edward Island'],
    [/,\s*NY\b/g, ', New York'],
    [/,\s*TX\b/g, ', Texas'],
    [/,\s*CA\b/g, ', California'],
    [/,\s*AZ\b/g, ', Arizona'],
    [/,\s*WA\b/g, ', Washington'],
    [/,\s*OR\b/g, ', Oregon'],
    [/\bNNE\b/g, 'north northeast'],
    [/\bENE\b/g, 'east northeast'],
    [/\bESE\b/g, 'east southeast'],
    [/\bSSE\b/g, 'south southeast'],
    [/\bSSW\b/g, 'south southwest'],
    [/\bWSW\b/g, 'west southwest'],
    [/\bWNW\b/g, 'west northwest'],
    [/\bNNW\b/g, 'north northwest'],
    [/\bNE\b/g, 'northeast'],
    [/\bSE\b/g, 'southeast'],
    [/\bSW\b/g, 'southwest'],
    [/\bNW\b/g, 'northwest'],
    [/\bN\b/g, 'north'],
    [/\bE\b/g, 'east'],
    [/\bS\b/g, 'south'],
    [/\bW\b/g, 'west'],
]

const FORECAST_WEEKDAYS = new Set([
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
])

const FORECAST_SIMPLE_LABELS = new Set([
    'today',
    'tonight',
    'tomorrow',
    'this morning',
    'this afternoon',
    'overnight',
])

const FORECAST_TONIGHT_ALIASES = new Set([
    'evening',
    'this evening',
    'tonight',
])

function toIntegerOrNull(value) {
    if (value == null) {
        return null
    }
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
        return null
    }
    const integer = Math.trunc(numeric)
    return integer > 0 ? integer : null
}

function localDayElapsedMs(now) {
    return now.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime()
}

function localCalendarElapsedMs(now) {
    const dayCount = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / (24 * 60 * 60 * 1000))
    return (dayCount * 24 * 60 * 60 * 1000) + localDayElapsedMs(now)
}

function isWithinRecurringWindow(elapsedMs, periodMs, offsetMs, durationMs) {
    if (durationMs <= 0 || periodMs <= 0) {
        return false
    }
    const elapsed = elapsedMs - offsetMs
    const phase = ((elapsed % periodMs) + periodMs) % periodMs
    return phase < durationMs
}

function isBlackoutRuleActive(rule, now = new Date()) {
    const durationMinutes = toIntegerOrNull(rule?.duration)
    if (durationMinutes == null) {
        return false
    }

    const elapsedMs = localDayElapsedMs(now)
    const durationMs = durationMinutes * 60 * 1000
    const minuteInterval = toIntegerOrNull(rule?.minuteInterval)
    const tenMinInterval = toIntegerOrNull(rule?.tenMinInterval)
    const hourInterval = toIntegerOrNull(rule?.hourInterval)
    const quarterDayInterval = toIntegerOrNull(rule?.quarterDayInterval)
    const dayInterval = toIntegerOrNull(rule?.dayInterval)

    if (minuteInterval != null && isWithinRecurringWindow(elapsedMs, minuteInterval * 60 * 1000, 0, durationMs)) {
        return true
    }
    if (tenMinInterval != null && tenMinInterval < 10 && isWithinRecurringWindow(elapsedMs, 10 * 60 * 1000, tenMinInterval * 60 * 1000, durationMs)) {
        return true
    }
    if (hourInterval != null && isWithinRecurringWindow(elapsedMs, hourInterval * 60 * 60 * 1000, 0, durationMs)) {
        return true
    }
    if (quarterDayInterval != null && isWithinRecurringWindow(elapsedMs, quarterDayInterval * 6 * 60 * 60 * 1000, 0, durationMs)) {
        return true
    }
    if (dayInterval != null && isWithinRecurringWindow(localCalendarElapsedMs(now), dayInterval * 24 * 60 * 60 * 1000, 0, durationMs)) {
        return true
    }
    return false
}

export function isVocallocalEnabled(now = new Date()) {
    const cfg = config?.vocallocal
    if (!cfg || cfg.enabled === false) return false

    const blackout = cfg.blackout
    if (!blackout || blackout.enabled !== true) return true

    const timingRules = Array.isArray(blackout.timing) ? blackout.timing : []
    for (const rule of timingRules) {
        if (isBlackoutRuleActive(rule, now)) return false
    }
    return true
}

function normalizeText(value) {
    if (typeof value !== 'string') return ''
    return value.trim()
}

function normalizeNarrationText(value) {
    let text = normalizeText(value)
    text = text.replace(/\b(-?\d+(?:\.\d+)?)\s*(?:°\s*)?[FC]\b/gi, '$1 degrees')
    text = text.replace(/\b(-?\d+(?:\.\d+)?)\s*(?:in\.?|")\b/gi, '$1 inches')
    for (const [pattern, replacement] of WEATHER_TERM_DICTIONARY) {
        text = text.replace(pattern, replacement)
    }
    text = text.replace(/\s+/g, ' ').trim()
    return text
}

function toTitleWords(value) {
    return value.replace(/\b\w/g, (char) => char.toUpperCase())
}

function toForecastDaypartText(value, referenceTime = new Date()) {
    const normalized = normalizeText(value).toLowerCase().replace(/\s+/g, ' ')
    const hour = referenceTime.getHours()
    const eveningOrNight = hour >= 18 || hour < 6
    if ((normalized === 'today' || normalized === 'this afternoon' || normalized === 'this evening') && eveningOrNight) {
        return 'Tonight.'
    }
    if (FORECAST_TONIGHT_ALIASES.has(normalized)) {
        return 'Tonight.'
    }
    if (FORECAST_SIMPLE_LABELS.has(normalized)) {
        return `${toTitleWords(normalized)}.`
    }
    if (FORECAST_WEEKDAYS.has(normalized)) {
        return `On ${toTitleWords(normalized)}.`
    }
    const nightMatch = normalized.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+night$/)
    if (nightMatch) {
        return `${toTitleWords(nightMatch[1])} night.`
    }
    return ''
}

function expressiveVoice(language) {
    const vocalConfig = config?.vocallocal || {}
    const voiceConfig = vocalConfig.voice || {}
    return {
        engine: voiceConfig.engine || 'auto',
        voice: voiceConfig.name || voiceConfig.voice || 'en_us-lessac-medium',
        rate: Number.isFinite(voiceConfig.rate) ? voiceConfig.rate : -1,
        pitch: Number.isFinite(voiceConfig.pitch) ? voiceConfig.pitch : 2,
        volume: Number.isFinite(voiceConfig.volume) ? voiceConfig.volume : 100,
        language,
    }
}

async function requestVocallocal(payload) {
    if (!isVocallocalEnabled()) {
        return null
    }

    const response = await fetch('/vocallocal/clips', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })

    if (!response.ok) {
        const bodyText = await response.text()
        throw new Error(`vocallocal request failed (${response.status}): ${bodyText}`)
    }

    return response.json()
}

async function prefetchClipFiles(urls) {
    const jobs = []
    for (const item of urls) {
        const url = typeof item === 'string' ? item : item?.url
        if (!url) continue
        jobs.push(fetch(url, { cache: 'force-cache' }))
    }
    await Promise.allSettled(jobs)
}

async function queueSlideNarration(slideId, requests) {
    const urls = []
    for (const request of requests) {
        try {
            const payload = {
                ...request,
                text: normalizeNarrationText(request?.text || ''),
            }
            const manifest = await requestVocallocal(payload)
            for (const clip of manifest.clips || []) {
                if (clip?.url) {
                    urls.push({
                        url: clip.url,
                        durationSeconds: Number(clip.durationSeconds) || 0,
                    })
                }
            }
        } catch (error) {
            console.warn(logTheFrickinTime, `Narration request failed for ${slideId}:`, error)
        }
    }
    slideClipMap.set(slideId, urls)
    await prefetchClipFiles(urls)
}

export async function prefetchMainVocallocal(payload) {
    slideClipMap.clear()
    if (!isVocallocalEnabled()) {
        return
    }

    const referenceTime = new Date()
    const language = normalizeText(payload?.language) || 'en'
    const currentNarration = normalizeNarrationText(payload?.currentNarration)
    const forecastNarrativeDay1 = normalizeNarrationText(payload?.forecastNarrativeDay1)
    const forecastNarrativeDay2 = normalizeNarrationText(payload?.forecastNarrativeDay2)
    const forecastDayOneIntro = toForecastDaypartText(payload?.forecastDayOne, referenceTime)
    const forecastDayTwoIntro = toForecastDaypartText(payload?.forecastDayTwo, referenceTime)
    const forecastShortTermPeriods = Array.isArray(payload?.forecastShortTermPeriods) ? payload.forecastShortTermPeriods : []
    const voice = payload?.voice || expressiveVoice(language)

    const forecastShortTermRequests = []
    const forecastShortTermPeriodRequests = []
    for (const period of forecastShortTermPeriods) {
        const intro = toForecastDaypartText(period?.daypart, referenceTime)
        const narrative = normalizeNarrationText(period?.narrative)
        const periodRequests = []
        if (intro) {
            const req = { language, section: 'forecast', text: intro, splitSentences: false, voice }
            forecastShortTermRequests.push(req)
            periodRequests.push(req)
        }
        if (narrative) {
            const req = { language, section: 'forecast', text: narrative, splitSentences: true, voice }
            forecastShortTermRequests.push(req)
            periodRequests.push(req)
        }
        forecastShortTermPeriodRequests.push(periodRequests)
    }

    if (forecastShortTermRequests.length === 0) {
        const fallbackPeriodZero = []
        if (forecastDayOneIntro) {
            const req = { language, section: 'forecast', text: forecastDayOneIntro, splitSentences: false, voice }
            forecastShortTermRequests.push(req)
            fallbackPeriodZero.push(req)
        }
        if (forecastNarrativeDay1) {
            const req = { language, section: 'forecast', text: forecastNarrativeDay1, splitSentences: true, voice }
            forecastShortTermRequests.push(req)
            fallbackPeriodZero.push(req)
        }
        const fallbackPeriodOne = []
        if (forecastDayTwoIntro) {
            const req = { language, section: 'forecast', text: forecastDayTwoIntro, splitSentences: false, voice }
            forecastShortTermRequests.push(req)
            fallbackPeriodOne.push(req)
        }
        if (forecastNarrativeDay2) {
            const req = { language, section: 'forecast', text: forecastNarrativeDay2, splitSentences: true, voice }
            forecastShortTermRequests.push(req)
            fallbackPeriodOne.push(req)
        }
        if (fallbackPeriodZero.length > 0) {
            forecastShortTermPeriodRequests.push(fallbackPeriodZero)
        }
        if (fallbackPeriodOne.length > 0) {
            forecastShortTermPeriodRequests.push(fallbackPeriodOne)
        }
    }

    const jobs = [
        queueSlideNarration('current', [
            ...(currentNarration
                ? [{ language, section: 'current', text: currentNarration, splitSentences: false, voice }]
                : [{ language, section: 'current', key: 'intro_default', voice }])
        ]),
        queueSlideNarration('radar', [
            { language, section: 'radar', key: 'intro_doppler_radar', voice }
        ]),
        queueSlideNarration('forecast-shortterm', forecastShortTermRequests),
        queueSlideNarration('forecast-extended', [
            { language, section: 'forecast', key: 'intro_default', voice }
        ])
    ]

    for (let index = 0; index < forecastShortTermPeriodRequests.length; index++) {
        jobs.push(queueSlideNarration(`forecast-shortterm-${index}`, forecastShortTermPeriodRequests[index]))
    }

    await Promise.allSettled(jobs)
}

export function getVocallocalQueueForSlide(slideId) {
    return slideClipMap.get(slideId) || []
}

export function getVocallocalTotalDurationMsForSlide(slideId) {
    const queue = slideClipMap.get(slideId) || []
    let totalSeconds = 0
    for (const item of queue) {
        if (typeof item === 'string') {
            continue
        }
        totalSeconds += Number(item?.durationSeconds) || 0
    }
    return Math.round(totalSeconds * 1000)
}
