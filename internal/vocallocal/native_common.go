package vocallocal

import (
	"archive/tar"
	"compress/bzip2"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

const defaultPiperEspeakDataURL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/espeak-ng-data.tar.bz2"

var errNativePiperUnavailable = errors.New("native piper runtime is not available in this build")

type piperVoiceConfig struct {
	Audio struct {
		SampleRate int    `json:"sample_rate"`
		Quality    string `json:"quality"`
	} `json:"audio"`
	Espeak struct {
		Voice string `json:"voice"`
	} `json:"espeak"`
	Language struct {
		Code        string `json:"code"`
		NameEnglish string `json:"name_english"`
	} `json:"language"`
	Inference struct {
		NoiseScale  float32 `json:"noise_scale"`
		LengthScale float32 `json:"length_scale"`
		NoiseW      float32 `json:"noise_w"`
	} `json:"inference"`
	NumSpeakers  int              `json:"num_speakers"`
	PhonemeIDMap map[string][]int `json:"phoneme_id_map"`
}

type nativePiperRequest struct {
	ModelPath  string
	ConfigPath string
	DataDir    string
	Text       string
	Rate       int
	Volume     int
}

func (s *Service) synthesizeDownloadedPiper(ctx context.Context, outputPath string, text string, voice VoiceConfig, ensureModel func() (string, string, error), label string) error {
	modelPath, configPath, err := ensureModel()
	if err != nil {
		return err
	}
	engine := strings.ToLower(strings.TrimSpace(voice.Engine))
	if engine == "" {
		engine = "piper"
	}
	if engine == "auto" || engine == "native" || engine == "onnx" || engine == "sherpa" {
		if err := s.synthesizeNativePiper(ctx, outputPath, text, voice, modelPath, configPath); err == nil {
			return nil
		} else if engine == "native" || engine == "onnx" || engine == "sherpa" {
			return fmt.Errorf("native %s synthesis failed: %w", label, err)
		}
	}
	return s.synthesizePiperExecutable(ctx, outputPath, text, voice, modelPath, configPath, label)
}

func (s *Service) synthesizeNativePiper(ctx context.Context, outputPath string, text string, voice VoiceConfig, modelPath string, configPath string) error {
	dataDir, err := s.ensurePiperEspeakDataDir(ctx, modelPath)
	if err != nil {
		return err
	}
	config, err := loadPiperVoiceConfig(configPath)
	if err != nil {
		return err
	}
	if err := ensurePiperModelMetadata(modelPath, config); err != nil {
		return err
	}
	if _, err := ensurePiperTokensFile(configPath, config); err != nil {
		return err
	}
	wav, err := nativePiperSynthesize(ctx, nativePiperRequest{
		ModelPath:  modelPath,
		ConfigPath: configPath,
		DataDir:    dataDir,
		Text:       text,
		Rate:       100 + voice.Rate*6,
		Volume:     voice.Volume,
	})
	if err != nil {
		return err
	}
	return os.WriteFile(outputPath, wav, 0o644)
}

func loadPiperVoiceConfig(configPath string) (piperVoiceConfig, error) {
	raw, err := os.ReadFile(filepath.Clean(configPath))
	if err != nil {
		return piperVoiceConfig{}, err
	}
	var config piperVoiceConfig
	if err := json.Unmarshal(raw, &config); err != nil {
		return piperVoiceConfig{}, fmt.Errorf("parse piper voice config: %w", err)
	}
	if config.Inference.NoiseScale == 0 {
		config.Inference.NoiseScale = 0.667
	}
	if config.Inference.NoiseW == 0 {
		config.Inference.NoiseW = 0.8
	}
	if config.Inference.LengthScale == 0 {
		config.Inference.LengthScale = 1
	}
	return config, nil
}

func ensurePiperTokensFile(configPath string, config piperVoiceConfig) (string, error) {
	tokensPath := strings.TrimSuffix(configPath, ".json") + ".tokens.txt"
	if _, err := os.Stat(tokensPath); err == nil {
		return tokensPath, nil
	}
	if len(config.PhonemeIDMap) == 0 {
		return "", fmt.Errorf("piper voice config has no phoneme_id_map")
	}
	type tokenID struct {
		Token string
		ID    int
	}
	tokens := make([]tokenID, 0, len(config.PhonemeIDMap))
	for token, values := range config.PhonemeIDMap {
		if len(values) == 0 || values[0] < 0 {
			continue
		}
		tokens = append(tokens, tokenID{Token: token, ID: values[0]})
	}
	if len(tokens) == 0 {
		return "", fmt.Errorf("piper voice config has no usable token IDs")
	}
	sort.Slice(tokens, func(i, j int) bool {
		if tokens[i].ID == tokens[j].ID {
			return tokens[i].Token < tokens[j].Token
		}
		return tokens[i].ID < tokens[j].ID
	})
	var builder strings.Builder
	for _, item := range tokens {
		builder.WriteString(item.Token)
		builder.WriteByte(' ')
		builder.WriteString(strconv.Itoa(item.ID))
		builder.WriteByte('\n')
	}
	return tokensPath, writeFileAtomic(tokensPath, []byte(builder.String()), 0o644)
}

func ensurePiperModelMetadata(modelPath string, config piperVoiceConfig) error {
	if config.Audio.SampleRate <= 0 {
		return fmt.Errorf("piper voice config has no audio.sample_rate")
	}
	nSpeakers := config.NumSpeakers
	if nSpeakers <= 0 {
		nSpeakers = 1
	}
	language := strings.TrimSpace(config.Language.NameEnglish)
	if language == "" {
		language = strings.TrimSpace(config.Language.Code)
	}
	metadata := map[string]string{
		"model_type":  "vits",
		"comment":     "piper",
		"language":    language,
		"voice":       strings.TrimSpace(config.Espeak.Voice),
		"has_espeak":  "1",
		"n_speakers":  strconv.Itoa(nSpeakers),
		"sample_rate": strconv.Itoa(config.Audio.SampleRate),
	}
	raw, err := os.ReadFile(filepath.Clean(modelPath))
	if err != nil {
		return err
	}
	existing := onnxMetadata(raw)
	keys := make([]string, 0, len(metadata))
	for key, value := range metadata {
		if strings.TrimSpace(existing[key]) == "" {
			keys = append(keys, key)
			raw = appendONNXMetadataEntry(raw, key, value)
		}
	}
	if len(keys) == 0 {
		return nil
	}
	return writeFileAtomic(filepath.Clean(modelPath), raw, 0o644)
}

func (s *Service) ensurePiperEspeakDataDir(ctx context.Context, modelPath string) (string, error) {
	for _, candidate := range []string{
		strings.TrimSpace(os.Getenv("WHDS_PIPER_DATA_DIR")),
		strings.TrimSpace(os.Getenv("HAZE_PIPER_DATA_DIR")),
		filepath.Join(s.dataPath, "espeak-ng-data"),
		filepath.Join(filepath.Dir(modelPath), "espeak-ng-data"),
	} {
		if candidate == "" {
			continue
		}
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate, nil
		}
	}
	if err := os.MkdirAll(s.dataPath, 0o755); err != nil {
		return "", err
	}
	archivePath := filepath.Join(s.dataPath, "espeak-ng-data.tar.bz2")
	if _, err := os.Stat(archivePath); err != nil {
		if err := downloadFileWithContext(ctx, archivePath, envOrDefault("WHDS_PIPER_ESPEAK_DATA_URL", defaultPiperEspeakDataURL)); err != nil {
			return "", err
		}
	}
	if err := extractPiperDataArchive(archivePath, s.dataPath); err != nil {
		return "", err
	}
	dataDir := filepath.Join(s.dataPath, "espeak-ng-data")
	if info, err := os.Stat(dataDir); err == nil && info.IsDir() {
		return dataDir, nil
	}
	return "", fmt.Errorf("piper espeak-ng-data archive did not contain espeak-ng-data")
}

func extractPiperDataArchive(archivePath string, targetRoot string) error {
	file, err := os.Open(filepath.Clean(archivePath))
	if err != nil {
		return err
	}
	defer file.Close()
	reader := tar.NewReader(bzip2.NewReader(file))
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		name := filepath.Clean(filepath.FromSlash(header.Name))
		if strings.HasPrefix(name, "..") || filepath.IsAbs(name) {
			return fmt.Errorf("piper espeak-ng-data archive entry escapes target: %s", header.Name)
		}
		target := filepath.Join(targetRoot, name)
		if !pathWithin(targetRoot, target) {
			return fmt.Errorf("piper espeak-ng-data archive entry escapes target: %s", header.Name)
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg, tar.TypeRegA:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			if err := writeReaderToFile(target, reader, header.FileInfo().Mode()); err != nil {
				return err
			}
		}
	}
}

func downloadFileWithContext(ctx context.Context, path string, url string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 2 * time.Minute}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("download failed with status %d", response.StatusCode)
	}
	tmp := fmt.Sprintf("%s.%d.tmp", path, time.Now().UnixNano())
	target, err := os.Create(tmp)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(target, response.Body)
	closeErr := target.Close()
	if copyErr != nil {
		_ = os.Remove(tmp)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(tmp)
		return closeErr
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func writeReaderToFile(path string, reader io.Reader, mode os.FileMode) error {
	if mode == 0 {
		mode = 0o644
	}
	file, err := os.OpenFile(filepath.Clean(path), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(file, reader)
	closeErr := file.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func writeFileAtomic(path string, data []byte, mode os.FileMode) error {
	tmp := fmt.Sprintf("%s.%d.tmp", path, time.Now().UnixNano())
	if err := os.WriteFile(tmp, data, mode); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func pathWithin(root string, path string) bool {
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return false
	}
	pathAbs, err := filepath.Abs(path)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(rootAbs, pathAbs)
	if err != nil {
		return false
	}
	return rel == "." || rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func nativePiperThreads() int {
	if value, err := strconv.Atoi(strings.TrimSpace(os.Getenv("WHDS_PIPER_THREADS"))); err == nil && value > 0 {
		return value
	}
	cpus := runtime.NumCPU()
	if cpus < 1 {
		return 1
	}
	if cpus > 4 {
		return 4
	}
	return cpus
}

func nativePiperProvider() string {
	return envOrDefault("WHDS_PIPER_PROVIDER", "cpu")
}

func nativePiperSpeed(rate int) float32 {
	if rate <= 0 {
		rate = 100
	}
	speed := float32(rate) / 100
	if speed < 0.5 {
		return 0.5
	}
	if speed > 2 {
		return 2
	}
	return speed
}

func applyVolume(samples []float32, volume int) []float32 {
	if volume <= 0 || volume == 100 {
		return samples
	}
	gain := float32(volume) / 100
	scaled := make([]float32, len(samples))
	for i, sample := range samples {
		value := sample * gain
		if value < -1 {
			value = -1
		} else if value > 1 {
			value = 1
		}
		scaled[i] = value
	}
	return scaled
}

func envOrDefault(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func appendONNXMetadataEntry(raw []byte, key string, value string) []byte {
	entry := []byte{}
	entry = appendProtoString(entry, 1, key)
	entry = appendProtoString(entry, 2, value)
	raw = appendProtoVarint(raw, uint64(14<<3|2))
	raw = appendProtoVarint(raw, uint64(len(entry)))
	raw = append(raw, entry...)
	return raw
}

func appendProtoString(raw []byte, field int, value string) []byte {
	raw = appendProtoVarint(raw, uint64(field<<3|2))
	raw = appendProtoVarint(raw, uint64(len(value)))
	raw = append(raw, value...)
	return raw
}

func appendProtoVarint(raw []byte, value uint64) []byte {
	for value >= 0x80 {
		raw = append(raw, byte(value)|0x80)
		value >>= 7
	}
	return append(raw, byte(value))
}

func onnxMetadata(raw []byte) map[string]string {
	values := map[string]string{}
	for offset := 0; offset < len(raw); {
		tag, next, ok := readProtoVarint(raw, offset)
		if !ok {
			return values
		}
		offset = next
		field := int(tag >> 3)
		wire := int(tag & 0x7)
		if field == 14 && wire == 2 {
			payload, after, ok := readProtoBytes(raw, offset)
			if !ok {
				return values
			}
			key, value := parseONNXMetadataEntry(payload)
			if key != "" {
				values[key] = value
			}
			offset = after
			continue
		}
		nextOffset, ok := skipProtoValue(raw, offset, wire)
		if !ok {
			return values
		}
		offset = nextOffset
	}
	return values
}

func parseONNXMetadataEntry(raw []byte) (string, string) {
	var key string
	var value string
	for offset := 0; offset < len(raw); {
		tag, next, ok := readProtoVarint(raw, offset)
		if !ok {
			return key, value
		}
		offset = next
		field := int(tag >> 3)
		wire := int(tag & 0x7)
		if (field == 1 || field == 2) && wire == 2 {
			payload, after, ok := readProtoBytes(raw, offset)
			if !ok {
				return key, value
			}
			if field == 1 {
				key = string(payload)
			} else {
				value = string(payload)
			}
			offset = after
			continue
		}
		nextOffset, ok := skipProtoValue(raw, offset, wire)
		if !ok {
			return key, value
		}
		offset = nextOffset
	}
	return key, value
}

func readProtoBytes(raw []byte, offset int) ([]byte, int, bool) {
	length, next, ok := readProtoVarint(raw, offset)
	if !ok || length > uint64(len(raw)-next) {
		return nil, offset, false
	}
	end := next + int(length)
	return raw[next:end], end, true
}

func readProtoVarint(raw []byte, offset int) (uint64, int, bool) {
	var value uint64
	for shift := 0; shift < 64 && offset < len(raw); shift += 7 {
		b := raw[offset]
		offset++
		value |= uint64(b&0x7f) << shift
		if b < 0x80 {
			return value, offset, true
		}
	}
	return 0, offset, false
}

func skipProtoValue(raw []byte, offset int, wire int) (int, bool) {
	switch wire {
	case 0:
		_, next, ok := readProtoVarint(raw, offset)
		return next, ok
	case 1:
		if len(raw)-offset < 8 {
			return offset, false
		}
		return offset + 8, true
	case 2:
		_, next, ok := readProtoBytes(raw, offset)
		return next, ok
	case 5:
		if len(raw)-offset < 4 {
			return offset, false
		}
		return offset + 4, true
	default:
		return offset, false
	}
}
