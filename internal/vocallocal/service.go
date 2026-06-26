package vocallocal

import (
	"archive/tar"
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"

	asset "github.com/amitybell/piper-asset"
	linuxbin "github.com/amitybell/piper-bin-linux"
	windowsbin "github.com/amitybell/piper-bin-windows"
	alan "github.com/amitybell/piper-voice-alan"
	jenny "github.com/amitybell/piper-voice-jenny"
	"github.com/fresh-cut/piper"
	"github.com/klauspost/compress/zstd"
)

type Service struct {
	mu        sync.Mutex
	publicDir string
	basePath  string
	baseURL   string
	dataPath  string
	ttsByKey  map[string]*piper.TTS
	piperExe  string
	fileLocks map[string]*sync.Mutex
}

func NewService(publicDir string) (*Service, error) {
	workspaceDir := filepath.Dir(publicDir)
	basePath := filepath.Join(workspaceDir, "persistentCache", "vocalclips")
	if err := os.MkdirAll(basePath, 0o755); err != nil {
		return nil, err
	}
	return &Service{
		publicDir: publicDir,
		basePath:  basePath,
		baseURL:   "/persistentCache/vocalclips",
		dataPath:  filepath.Join(basePath, "piper-data"),
		ttsByKey:  map[string]*piper.TTS{},
		fileLocks: map[string]*sync.Mutex{},
	}, nil
}

func (s *Service) EnsureClips(ctx context.Context, request ClipRequest) (ClipResponse, error) {
	language := strings.TrimSpace(strings.ToLower(request.Language))
	if language == "" {
		language = "en"
	}
	section := strings.TrimSpace(strings.ToLower(request.Section))
	text := strings.TrimSpace(request.Text)
	if text == "" && request.Key != "" {
		key := strings.TrimSpace(strings.ToLower(request.Key))
		if section == "" {
			resolved, resolvedSection, err := ResolveStaticPhraseAnySection(language, key)
			if err != nil {
				return ClipResponse{}, err
			}
			text = resolved
			section = resolvedSection
		} else {
			resolved, err := ResolveStaticPhrase(language, section, key)
			if err != nil {
				return ClipResponse{}, err
			}
			text = resolved
		}
	}
	if text == "" {
		return ClipResponse{}, fmt.Errorf("text is empty")
	}
	clipKind := "dynamic"
	if strings.TrimSpace(request.Key) != "" {
		clipKind = "static"
	}
	voice := normalizeVoiceConfig(request.Voice, language)
	voiceFingerprint := fingerprintVoice(voice)
	segments := []string{text}
	if request.SplitSentences || section == "forecast" {
		segments = splitSentences(text)
	}
	if len(segments) == 0 {
		segments = []string{text}
	}
	clips := make([]ClipDescriptor, 0, len(segments))
	for _, sentence := range segments {
		sentence = strings.TrimSpace(sentence)
		if sentence == "" {
			continue
		}
		relativePath := s.clipRelativePath(clipKind, voiceFingerprint, language, section, sentence)
		absolutePath := filepath.Join(s.basePath, filepath.FromSlash(relativePath))
		cached := fileExists(absolutePath)
		if !cached {
			if err := s.ensureClip(ctx, absolutePath, sentence, voice); err != nil {
				return ClipResponse{}, err
			}
			cached = false
		}
		durationSeconds, _ := wavDurationSeconds(absolutePath)
		clips = append(clips, ClipDescriptor{
			Text:            sentence,
			Sentence:        sentence,
			Cached:          cached,
			URL:             s.baseURL + "/" + filepath.ToSlash(relativePath),
			DurationSeconds: durationSeconds,
		})
	}
	return ClipResponse{
		Language:         language,
		Section:          section,
		VoiceFingerprint: voiceFingerprint,
		Clips:            clips,
	}, nil
}

func (s *Service) clipRelativePath(clipKind string, voiceFingerprint string, language string, section string, sentence string) string {
	sum := sha1.Sum([]byte(language + "|" + section + "|" + sentence))
	fileName := hex.EncodeToString(sum[:]) + ".wav"
	return filepath.ToSlash(filepath.Join(clipKind, voiceFingerprint, language, section, fileName))
}

func (s *Service) ensureClip(ctx context.Context, absolutePath string, sentence string, voice VoiceConfig) error {
	lock := s.fileLock(absolutePath)
	lock.Lock()
	defer lock.Unlock()

	if fileExists(absolutePath) {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(absolutePath), 0o755); err != nil {
		return err
	}
	return s.synthesizeClip(ctx, absolutePath, sentence, voice)
}

func (s *Service) fileLock(path string) *sync.Mutex {
	s.mu.Lock()
	defer s.mu.Unlock()
	lock := s.fileLocks[path]
	if lock == nil {
		lock = &sync.Mutex{}
		s.fileLocks[path] = lock
	}
	return lock
}

func normalizeVoiceConfig(config VoiceConfig, language string) VoiceConfig {
	output := config
	if strings.TrimSpace(output.Engine) == "" {
		output.Engine = "auto"
	}
	if strings.TrimSpace(output.Voice) == "" {
		output.Voice = "en_us-lessac-medium"
	}
	if output.Volume < 0 || output.Volume > 100 {
		output.Volume = 100
	}
	if output.Rate < -10 || output.Rate > 10 {
		output.Rate = -1
	}
	if output.Pitch < -10 || output.Pitch > 10 {
		output.Pitch = 2
	}
	if strings.TrimSpace(output.Language) == "" {
		output.Language = language
	}
	return output
}

func fingerprintVoice(config VoiceConfig) string {
	payload, _ := json.Marshal(config)
	sum := sha1.Sum(payload)
	return hex.EncodeToString(sum[:8])
}

var sentenceSplitRegex = regexp.MustCompile(`(?m)([^.!?]+[.!?]+|[^.!?]+$)`)

func splitSentences(text string) []string {
	matches := sentenceSplitRegex.FindAllString(text, -1)
	parts := make([]string, 0, len(matches))
	for _, match := range matches {
		clean := strings.TrimSpace(match)
		if clean != "" {
			parts = append(parts, clean)
		}
	}
	if len(parts) == 0 {
		clean := strings.TrimSpace(text)
		if clean != "" {
			parts = append(parts, clean)
		}
	}
	return parts
}

func wavDurationSeconds(filePath string) (float64, error) {
	bytesData, err := os.ReadFile(filePath)
	if err != nil {
		return 0, err
	}
	if len(bytesData) < 44 {
		return 0, fmt.Errorf("wav file is too short")
	}
	if string(bytesData[0:4]) != "RIFF" || string(bytesData[8:12]) != "WAVE" {
		return 0, fmt.Errorf("invalid wav header")
	}

	var numChannels uint16
	var sampleRate uint32
	var bitsPerSample uint16
	var dataSize uint32

	for offset := 12; offset+8 <= len(bytesData); {
		chunkID := string(bytesData[offset : offset+4])
		chunkSize := int(binary.LittleEndian.Uint32(bytesData[offset+4 : offset+8]))
		chunkDataStart := offset + 8
		chunkDataEnd := chunkDataStart + chunkSize
		if chunkDataEnd > len(bytesData) {
			break
		}

		switch chunkID {
		case "fmt ":
			if chunkSize >= 16 {
				numChannels = binary.LittleEndian.Uint16(bytesData[chunkDataStart+2 : chunkDataStart+4])
				sampleRate = binary.LittleEndian.Uint32(bytesData[chunkDataStart+4 : chunkDataStart+8])
				bitsPerSample = binary.LittleEndian.Uint16(bytesData[chunkDataStart+14 : chunkDataStart+16])
			}
		case "data":
			dataSize = uint32(chunkSize)
		}

		offset = chunkDataEnd
		if chunkSize%2 != 0 {
			offset++
		}
	}

	if numChannels == 0 || sampleRate == 0 || bitsPerSample == 0 || dataSize == 0 {
		return 0, fmt.Errorf("wav metadata is incomplete")
	}
	bytesPerSecond := float64(sampleRate) * float64(numChannels) * float64(bitsPerSample) / 8.0
	if bytesPerSecond <= 0 {
		return 0, fmt.Errorf("wav bytes per second is invalid")
	}
	return float64(dataSize) / bytesPerSecond, nil
}

func (s *Service) synthesizeClip(ctx context.Context, outputPath string, text string, voice VoiceConfig) error {
	voiceName := strings.TrimSpace(strings.ToLower(voice.Voice))
	if isHFCMaleVoice(voiceName) {
		return s.synthesizeHFCMale(ctx, outputPath, text, voice)
	}
	if isLessacVoice(voiceName) {
		return s.synthesizeLessac(ctx, outputPath, text, voice)
	}
	tts, err := s.resolveTTS(voice)
	if err != nil {
		return err
	}
	s.mu.Lock()
	wav, err := tts.Synthesize(text)
	s.mu.Unlock()
	if err != nil {
		return err
	}
	return os.WriteFile(outputPath, wav, 0o644)
}

func (s *Service) resolveTTS(voice VoiceConfig) (*piper.TTS, error) {
	voiceName := strings.TrimSpace(strings.ToLower(voice.Voice))
	if voiceName == "" {
		voiceName = "jenny"
	}
	cacheKey := voiceName
	s.mu.Lock()
	defer s.mu.Unlock()
	if cached, ok := s.ttsByKey[cacheKey]; ok {
		return cached, nil
	}
	voiceAsset, err := resolveVoiceAsset(voiceName)
	if err != nil {
		return nil, err
	}
	tts, err := piper.New(s.dataPath, voiceAsset)
	if err != nil {
		return nil, err
	}
	s.ttsByKey[cacheKey] = tts
	return tts, nil
}

func (s *Service) synthesizeHFCMale(ctx context.Context, outputPath string, text string, voice VoiceConfig) error {
	return s.synthesizeDownloadedPiper(ctx, outputPath, text, voice, s.ensureHFCMaleModel, "hfc_male")
}

func (s *Service) synthesizeLessac(ctx context.Context, outputPath string, text string, voice VoiceConfig) error {
	return s.synthesizeDownloadedPiper(ctx, outputPath, text, voice, s.ensureLessacModel, "lessac")
}

func (s *Service) synthesizePiperExecutable(ctx context.Context, outputPath string, text string, voice VoiceConfig, modelPath string, configPath string, label string) error {
	binaryPath, err := s.ensurePiperBinary()
	if err != nil {
		return err
	}
	lengthScale, noiseScale, noiseW := piperEmotionTuning(voice)
	cmd := exec.CommandContext(
		ctx,
		binaryPath,
		"--model", modelPath,
		"--config", configPath,
		"--output_file", outputPath,
		"--length_scale", fmt.Sprintf("%.2f", lengthScale),
		"--noise_scale", fmt.Sprintf("%.2f", noiseScale),
		"--noise_w", fmt.Sprintf("%.2f", noiseW),
	)
	cmd.Stdin = strings.NewReader(text)
	stderr := bytes.NewBuffer(nil)
	cmd.Stderr = stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("piper %s synthesis failed: %w: %s", label, err, strings.TrimSpace(stderr.String()))
	}
	return nil
}

func piperEmotionTuning(voice VoiceConfig) (float64, float64, float64) {
	rateScale := 1.05 - (float64(voice.Rate) * 0.03)
	if rateScale < 0.75 {
		rateScale = 0.75
	}
	if rateScale > 1.40 {
		rateScale = 1.40
	}
	pitchScale := 0.80 + (float64(voice.Pitch) * 0.03)
	if pitchScale < 0.60 {
		pitchScale = 0.60
	}
	if pitchScale > 1.20 {
		pitchScale = 1.20
	}
	noiseWeight := 0.75 + (float64(voice.Pitch) * 0.01)
	if noiseWeight < 0.60 {
		noiseWeight = 0.60
	}
	if noiseWeight > 0.95 {
		noiseWeight = 0.95
	}
	return rateScale, pitchScale, noiseWeight
}

func (s *Service) ensurePiperBinary() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.piperExe != "" && fileExists(s.piperExe) {
		return s.piperExe, nil
	}
	if configured := strings.TrimSpace(os.Getenv("PIPER_EXE")); configured != "" {
		if fileExists(configured) {
			if err := ensureExecutableFile(configured); err != nil {
				return "", err
			}
			s.piperExe = configured
			return s.piperExe, nil
		}
		return "", fmt.Errorf("PIPER_EXE does not exist: %s", configured)
	}
	binDir := filepath.Join(s.dataPath, "piper-bin-runtime")
	if err := installPiperBinAsset(binDir); err != nil {
		return "", err
	}
	candidates := []string{
		filepath.Join(binDir, "piper.exe"),
		filepath.Join(binDir, ".exe"),
		filepath.Join(binDir, "piper"),
	}
	for _, candidate := range candidates {
		if fileExists(candidate) {
			if err := ensureExecutableFile(candidate); err != nil {
				return "", err
			}
			s.piperExe = candidate
			return s.piperExe, nil
		}
	}
	return "", fmt.Errorf("piper binary not found in %s", binDir)
}

func ensureExecutableFile(path string) error {
	if runtime.GOOS == "windows" {
		return nil
	}
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	mode := info.Mode().Perm()
	if mode&0o111 != 0 {
		return nil
	}
	return os.Chmod(path, mode|0o755)
}

func installPiperBinAsset(destinationDir string) error {
	assetFS, err := selectPiperBinFS()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(destinationDir, 0o755); err != nil {
		return err
	}
	metaBytes, err := fs.ReadFile(assetFS, "dist.json")
	if err != nil {
		return err
	}
	metaPath := filepath.Join(destinationDir, "dist.json")
	if existingMeta, readErr := os.ReadFile(metaPath); readErr == nil {
		if bytes.Equal(existingMeta, metaBytes) {
			return ensurePiperExecutableBits(destinationDir)
		}
	}
	tempDir, err := os.MkdirTemp(filepath.Dir(destinationDir), "piper-bin-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)
	if err := os.WriteFile(filepath.Join(tempDir, "dist.json"), metaBytes, 0o644); err != nil {
		return err
	}
	archiveReader, err := assetFS.Open("dist.tzst")
	if err != nil {
		return err
	}
	defer archiveReader.Close()
	zstdReader, err := zstd.NewReader(archiveReader)
	if err != nil {
		return err
	}
	defer zstdReader.Close()
	tarReader := tar.NewReader(zstdReader)
	for {
		header, err := tarReader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}
		targetPath := filepath.Clean(filepath.Join(tempDir, header.Name))
		if !strings.HasPrefix(targetPath, filepath.Clean(tempDir)+string(filepath.Separator)) {
			return fmt.Errorf("invalid archive path: %s", header.Name)
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(targetPath, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
				return err
			}
			mode := header.FileInfo().Mode().Perm()
			if mode == 0 {
				mode = 0o644
			}
			output, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
			if err != nil {
				return err
			}
			if _, err := io.Copy(output, tarReader); err != nil {
				_ = output.Close()
				return err
			}
			if err := output.Close(); err != nil {
				return err
			}
			if err := os.Chmod(targetPath, mode); err != nil {
				return err
			}
		}
	}
	backupDir := destinationDir + ".bak"
	_ = os.RemoveAll(backupDir)
	if err := os.Rename(destinationDir, backupDir); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.Rename(tempDir, destinationDir); err != nil {
		_ = os.Rename(backupDir, destinationDir)
		return err
	}
	_ = os.RemoveAll(backupDir)
	return ensurePiperExecutableBits(destinationDir)
}

func ensurePiperExecutableBits(destinationDir string) error {
	if runtime.GOOS == "windows" {
		return nil
	}
	return filepath.WalkDir(destinationDir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || entry.Name() != "piper" {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		mode := info.Mode().Perm()
		if mode&0o111 != 0 {
			return nil
		}
		return os.Chmod(path, mode|0o755)
	})
}

func selectPiperBinFS() (fs.FS, error) {
	switch runtime.GOOS {
	case "windows":
		return windowsbin.Asset.FS, nil
	case "linux":
		return linuxbin.Asset.FS, nil
	default:
		return nil, fmt.Errorf("unsupported OS for bundled piper binary: %s", runtime.GOOS)
	}
}

func (s *Service) ensureHFCMaleModel() (string, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	modelDir := filepath.Join(s.dataPath, "hfc-male-medium")
	if err := os.MkdirAll(modelDir, 0o755); err != nil {
		return "", "", err
	}
	modelPath := filepath.Join(modelDir, "en_US-hfc_male-medium.onnx")
	configPath := filepath.Join(modelDir, "en_US-hfc_male-medium.onnx.json")
	if !fileExists(modelPath) {
		if err := downloadFile(modelPath, "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/hfc_male/medium/en_US-hfc_male-medium.onnx?download=true"); err != nil {
			return "", "", err
		}
	}
	if !fileExists(configPath) {
		if err := downloadFile(configPath, "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/hfc_male/medium/en_US-hfc_male-medium.onnx.json?download=true"); err != nil {
			return "", "", err
		}
	}
	return modelPath, configPath, nil
}

func (s *Service) ensureLessacModel() (string, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	modelDir := filepath.Join(s.dataPath, "lessac-medium")
	if err := os.MkdirAll(modelDir, 0o755); err != nil {
		return "", "", err
	}
	modelPath := filepath.Join(modelDir, "en_US-lessac-medium.onnx")
	configPath := filepath.Join(modelDir, "en_US-lessac-medium.onnx.json")
	if !fileExists(modelPath) {
		if err := downloadFile(modelPath, "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx?download=true"); err != nil {
			return "", "", err
		}
	}
	if !fileExists(configPath) {
		if err := downloadFile(configPath, "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json?download=true"); err != nil {
			return "", "", err
		}
	}
	return modelPath, configPath, nil
}

func downloadFile(path string, url string) error {
	response, err := http.Get(url)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("download failed with status %d", response.StatusCode)
	}
	target, err := os.Create(path)
	if err != nil {
		return err
	}
	defer target.Close()
	if _, err := io.Copy(target, response.Body); err != nil {
		return err
	}
	return nil
}

func isHFCMaleVoice(voiceName string) bool {
	switch voiceName {
	case "en_us-hfc_male-medium", "hfc_male", "hfc_male-medium", "en-us-hfc_male-medium", "en-us-hfc-male-medium":
		return true
	default:
		return false
	}
}

func isLessacVoice(voiceName string) bool {
	switch voiceName {
	case "en_us-lessac-medium", "lessac", "lessac-medium", "en-us-lessac-medium":
		return true
	default:
		return false
	}
}

func resolveVoiceAsset(voiceName string) (asset.Asset, error) {
	switch voiceName {
	case "jenny", "en-us-jenny":
		return jenny.Asset, nil
	case "alan", "en-us-alan":
		return alan.Asset, nil
	default:
		return asset.Asset{}, fmt.Errorf("unsupported piper voice: %s", voiceName)
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
