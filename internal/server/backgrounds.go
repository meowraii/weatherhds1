package server

import (
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type BackgroundManager struct {
	mu           sync.RWMutex
	publicDir    string
	index        map[string]map[string][]string
	selected     string
	selectedCond string
	initialized  string
	tickerStop   chan struct{}
}

func NewBackgroundManager(publicDir string) *BackgroundManager {
	return &BackgroundManager{
		publicDir:    publicDir,
		index:        buildBackgroundIndex(publicDir),
		selectedCond: "wxgood",
	}
}

func (b *BackgroundManager) Init(wxCond string) bool {
	if wxCond == "" {
		wxCond = "wxgood"
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.initialized == wxCond {
		return true
	}
	picked := b.pickExistingBackgroundLocked(wxCond)
	if picked == "" {
		return false
	}
	b.selected = picked
	b.selectedCond = wxCond
	b.initialized = wxCond
	if b.tickerStop != nil {
		close(b.tickerStop)
	}
	stop := make(chan struct{})
	b.tickerStop = stop
	go b.rotate(stop, wxCond)
	return true
}

func (b *BackgroundManager) rotate(stop <-chan struct{}, wxCond string) {
	ticker := time.NewTicker(24 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			b.mu.Lock()
			picked := b.pickExistingBackgroundLocked(wxCond)
			if picked != "" {
				b.selected = picked
			}
			b.mu.Unlock()
		}
	}
}

func (b *BackgroundManager) CurrentImage() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.selected == "" {
		return ""
	}
	absolute := filepath.Join(b.publicDir, filepath.FromSlash(strings.TrimPrefix(b.selected, "/")))
	if !isPathInPublicDir(b.publicDir, absolute) || !fileExists(absolute) {
		fallback := b.pickExistingBackgroundLocked(b.selectedCond)
		if fallback == "" {
			b.selected = ""
			return ""
		}
		b.selected = fallback
	}
	return b.selected
}

func (b *BackgroundManager) InitializedCondition() string {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.initialized
}

func (b *BackgroundManager) pickExistingBackgroundLocked(wxCond string) string {
	season := CurrentSeason(time.Now())
	list := b.index[season][normalizeCondition(wxCond)]
	if len(list) == 0 {
		return ""
	}
	perm := rand.Perm(len(list))
	for _, idx := range perm {
		candidate := list[idx]
		absolute := filepath.Join(b.publicDir, filepath.FromSlash(strings.TrimPrefix(candidate, "/")))
		if isPathInPublicDir(b.publicDir, absolute) && fileExists(absolute) {
			return candidate
		}
	}
	return ""
}

func buildBackgroundIndex(publicDir string) map[string]map[string][]string {
	root := filepath.Join(publicDir, "images", "bg_images")
	index := map[string]map[string][]string{}
	seasonEntries, err := os.ReadDir(root)
	if err != nil {
		return index
	}
	for _, seasonEntry := range seasonEntries {
		if !seasonEntry.IsDir() {
			continue
		}
		season := seasonEntry.Name()
		seasonPath := filepath.Join(root, season)
		conditionEntries, err := os.ReadDir(seasonPath)
		if err != nil {
			continue
		}
		if _, ok := index[season]; !ok {
			index[season] = map[string][]string{}
		}
		for _, conditionEntry := range conditionEntries {
			if !conditionEntry.IsDir() {
				continue
			}
			conditionKey := normalizeCondition(conditionEntry.Name())
			conditionPath := filepath.Join(seasonPath, conditionEntry.Name())
			files, err := os.ReadDir(conditionPath)
			if err != nil {
				continue
			}
			for _, file := range files {
				if file.IsDir() {
					continue
				}
				ext := strings.ToLower(filepath.Ext(file.Name()))
				switch ext {
				case ".avif", ".webp", ".png", ".jpg", ".jpeg":
				default:
					continue
				}
				absolute := filepath.Join(conditionPath, file.Name())
				relative, err := filepath.Rel(publicDir, absolute)
				if err != nil {
					continue
				}
				relative = filepath.ToSlash(relative)
				index[season][conditionKey] = append(index[season][conditionKey], "/"+relative)
			}
		}
	}
	return index
}

func normalizeCondition(value string) string {
	cleaned := strings.ToLower(strings.ReplaceAll(value, "_", ""))
	switch {
	case strings.Contains(cleaned, "bad"):
		return "wxbad"
	case strings.Contains(cleaned, "good"):
		return "wxgood"
	default:
		return cleaned
	}
}

func isPathInPublicDir(publicDir string, absoluteImagePath string) bool {
	public := filepath.Clean(publicDir)
	candidate := filepath.Clean(absoluteImagePath)
	public = strings.ToLower(public)
	candidate = strings.ToLower(candidate)
	if !strings.HasSuffix(public, string(filepath.Separator)) {
		public += string(filepath.Separator)
	}
	return strings.HasPrefix(candidate, public)
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
