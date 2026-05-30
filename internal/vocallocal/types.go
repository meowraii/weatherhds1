package vocallocal

type VoiceConfig struct {
	Engine   string `json:"engine"`
	Voice    string `json:"voice"`
	Rate     int    `json:"rate"`
	Volume   int    `json:"volume"`
	Pitch    int    `json:"pitch"`
	Language string `json:"language"`
}

type ClipRequest struct {
	Language       string      `json:"language"`
	Section        string      `json:"section"`
	Key            string      `json:"key"`
	Text           string      `json:"text"`
	SplitSentences bool        `json:"splitSentences"`
	Voice          VoiceConfig `json:"voice"`
}

type ClipDescriptor struct {
	Text            string  `json:"text"`
	URL             string  `json:"url"`
	Cached          bool    `json:"cached"`
	Sentence        string  `json:"sentence"`
	DurationSeconds float64 `json:"durationSeconds"`
}

type ClipResponse struct {
	Language         string           `json:"language"`
	Section          string           `json:"section"`
	VoiceFingerprint string           `json:"voiceFingerprint"`
	Clips            []ClipDescriptor `json:"clips"`
}
