package server

import "time"

func CurrentSeason(now time.Time) string {
	month := int(now.Month())
	day := now.Day()
	if (month == 12 && day >= 21) || (month <= 3 && day < 20) || (month < 3) {
		return "bg_winter"
	}
	if (month == 3 && day >= 20) || month < 6 || (month == 6 && day < 21) {
		return "bg_spring"
	}
	if (month == 6 && day >= 21) || month < 9 || (month == 9 && day < 23) {
		return "bg_summer"
	}
	return "bg_autumn"
}
