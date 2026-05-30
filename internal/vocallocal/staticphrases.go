package vocallocal

import "fmt"

var staticPhraseSectionOrder = []string{"forecast", "current", "radar", "national"}

var staticPhrases = map[string]map[string]map[string]string{
	"en": {
		"forecast": {
			"monday":	"On Monday.",
			"tuesday":	"On Tuesday.",
			"wednesday":"On Wednesday.",
			"thursday":	"On Thursday.",
			"friday":	"On Friday.",
			"saturday":	"On Saturday.",
			"sunday":	"On Sunday.",
			"tonight":	"For tonight.",
			"mon_night": "Monday night.",
			"tue_night": "Tuesday night.",
			"wed_night": "Wednesday night.",
			"thu_night": "Thursday night.",
			"fri_night": "Friday night.",
			"sat_night": "Saturday night.",
			"sun_night": "Sunday night.",
			"intro_default": "Our extended forecast.",
		},
		"current": {
			"intro_default": "Our current conditions.",
		},
		"radar": {
			"intro_doppler_radar": "Here is our local doppler radar.",
		},
		"national": {
			"intro_default":   "Forecasts and conditions for popular cities across the country by region.",
			"intro_canada":    "Forecasts and conditions for popular cities across Canada by region.",
			"intro_uk":        "Forecasts and conditions for popular cities across the UK by region.",
			"intro_australia": "Forecasts and conditions for popular cities across Australia by region.",
			"intro_us":        "Forecasts and conditions for popular cities across the United States by region.",
		},
	},
	"fr": {
		"forecast": {
			"monday":	"Lundi.",
			"tuesday":	"Mardi.",
			"wednesday":	"Mercredi.",
			"thursday":	"Jeudi.",
			"friday":	"Vendredi.",
			"saturday":	"Samedi.",
			"sunday":	"Dimanche.",
			"tonight":	"Pour ce soir.",	
			"intro_default": "Notre prévision étendue.",
		},
		"current": {
			"intro_default": "Nos conditions actuelles.",
		},
		"radar": {
			"intro_doppler_radar": "Notre radar Doppler local.",
		},
		"national": {
			"intro_default":   "Prévisions et conditions pour les villes populaires à travers le pays par région.",
			"intro_canada":    "Prévisions et conditions pour les villes populaires à travers le Canada par région.",
			"intro_uk":        "Prévisions et conditions pour les villes populaires à travers le Royaume-Uni par région.",
			"intro_australia": "Prévisions et conditions pour les villes populaires à travers l'Australie par région.",
			"intro_us":        "Prévisions et conditions pour les villes populaires à travers les États-Unis par région.",
		},
	},
}

func ResolveStaticPhrase(language string, section string, key string) (string, error) {
	langSet, ok := staticPhrases[language]
	if !ok {
		langSet, ok = staticPhrases["en"]
		if !ok {
			return "", fmt.Errorf("language set unavailable")
		}
	}
	sectionSet, ok := langSet[section]
	if !ok {
		return "", fmt.Errorf("unknown section: %s", section)
	}
	value, ok := sectionSet[key]
	if !ok {
		return "", fmt.Errorf("unknown phrase key: %s", key)
	}
	return value, nil
}

func ResolveStaticPhraseAnySection(language string, key string) (string, string, error) {
	langSet, ok := staticPhrases[language]
	if !ok {
		langSet, ok = staticPhrases["en"]
		if !ok {
			return "", "", fmt.Errorf("language set unavailable")
		}
	}
	for _, section := range staticPhraseSectionOrder {
		sectionSet, ok := langSet[section]
		if !ok {
			continue
		}
		value, ok := sectionSet[key]
		if ok {
			return value, section, nil
		}
	}
	return "", "", fmt.Errorf("unknown phrase key: %s", key)
}
