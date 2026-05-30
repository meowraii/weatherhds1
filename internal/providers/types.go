package providers

type LocaleData struct {
	LocaleName    string  `json:"localeName"`
	AdminDistrict string  `json:"adminDistrict"`
	Country       string  `json:"country"`
	CountryCode   string  `json:"countryCode"`
	Lat           float64 `json:"lat"`
	Lon           float64 `json:"lon"`
	PostalKey     string  `json:"postalKey"`
}

type CachedWeatherData map[string]any

type LocaleStore interface {
	Get(key string) (LocaleData, bool)
	Set(key string, value LocaleData) error
}

type TTLStore interface {
	Get(key string) (any, bool)
	Set(key string, value any)
}
