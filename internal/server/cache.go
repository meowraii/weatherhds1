package server

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"

	"weatherhds/internal/providers"
)

type cacheEntry struct {
	value     any
	expiresAt time.Time
}

type TTLCache struct {
	mu         sync.RWMutex
	items      map[string]cacheEntry
	defaultTTL time.Duration
}

func NewTTLCache(defaultTTL time.Duration) *TTLCache {
	return &TTLCache{
		items:      map[string]cacheEntry{},
		defaultTTL: defaultTTL,
	}
}

func (c *TTLCache) Get(key string) (any, bool) {
	c.mu.RLock()
	entry, ok := c.items[key]
	c.mu.RUnlock()
	if !ok {
		return nil, false
	}
	if time.Now().After(entry.expiresAt) {
		c.mu.Lock()
		delete(c.items, key)
		c.mu.Unlock()
		return nil, false
	}
	return entry.value, true
}

func (c *TTLCache) Set(key string, value any) {
	c.mu.Lock()
	c.items[key] = cacheEntry{value: value, expiresAt: time.Now().Add(c.defaultTTL)}
	c.mu.Unlock()
}

type PersistentLocaleCache struct {
	mu   sync.RWMutex
	path string
	data map[string]providers.LocaleData
}

func NewPersistentLocaleCache(baseDir string) (*PersistentLocaleCache, error) {
	cacheDir := filepath.Join(baseDir, "persistentCache")
	cacheFile := filepath.Join(cacheDir, "localeCache.json.gz")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		return nil, err
	}
	cache := &PersistentLocaleCache{
		path: cacheFile,
		data: map[string]providers.LocaleData{},
	}
	if _, err := os.Stat(cacheFile); errors.Is(err, os.ErrNotExist) {
		if err := cache.flush(); err != nil {
			return nil, err
		}
		return cache, nil
	}
	if err := cache.load(); err != nil {
		return nil, err
	}
	return cache, nil
}

func (p *PersistentLocaleCache) Get(key string) (providers.LocaleData, bool) {
	p.mu.RLock()
	value, ok := p.data[key]
	p.mu.RUnlock()
	return value, ok
}

func (p *PersistentLocaleCache) Set(key string, value providers.LocaleData) error {
	p.mu.Lock()
	p.data[key] = value
	err := p.flush()
	p.mu.Unlock()
	return err
}

func (p *PersistentLocaleCache) load() error {
	payload, err := os.ReadFile(p.path)
	if err != nil {
		return err
	}
	reader, err := gzip.NewReader(bytes.NewReader(payload))
	if err != nil {
		return err
	}
	defer reader.Close()
	decoded := map[string]providers.LocaleData{}
	if err := json.NewDecoder(reader).Decode(&decoded); err != nil {
		return err
	}
	p.data = decoded
	return nil
}

func (p *PersistentLocaleCache) flush() error {
	var jsonBuffer bytes.Buffer
	encoder := json.NewEncoder(&jsonBuffer)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(p.data); err != nil {
		return err
	}
	var compressed bytes.Buffer
	writer := gzip.NewWriter(&compressed)
	if _, err := writer.Write(jsonBuffer.Bytes()); err != nil {
		_ = writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return os.WriteFile(p.path, compressed.Bytes(), 0o644)
}
