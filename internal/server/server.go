package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"weatherhds/internal/providers"
	"weatherhds/internal/vocallocal"

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func Run(ctx context.Context) error {
	logger := bootLogger()
	_ = godotenv.Load()
	twcAPIKey := strings.TrimSpace(os.Getenv("TWC_API_KEY"))
	twcEnabled := twcAPIKey != ""
	mapboxTokenRaw := strings.TrimSpace(os.Getenv("MAPBOX_API_KEY"))
	var mapboxToken *string
	if mapboxTokenRaw != "" {
		mapboxToken = &mapboxTokenRaw
	}
	cfg := loadConfigFromEnv()
	workspaceDir, err := os.Getwd()
	if err != nil {
		return err
	}
	publicDir := filepath.Join(workspaceDir, "public")
	versionID := loadVersionFromConfig(filepath.Join(publicDir, "config.js"))
	printStartupArt()
	logInfo(logger, "server", "==========================================================================================================")
	logInfo(logger, "server", "WeatherHDS daemon v%s", versionID)
	logInfo(logger, "server", "Created by raiii. (c) SSPWXR/raii 2025")
	logInfo(logger, "server", "User contributors: ScentedOrangeDev, LeWolfYt,")
	if !twcEnabled {
		logInfo(logger, "server", "NO API KEY PRESENT! PLEASE ENTER A WEATHER.COM API KEY...")
	}
	localeCache, err := NewPersistentLocaleCache(workspaceDir)
	if err != nil {
		return err
	}
	ttlCache := NewTTLCache(time.Duration(cfg.CacheValidTime) * time.Second)
	client := &http.Client{Timeout: 20 * time.Second}
	twc := providers.NewTWCClient(client, twcAPIKey, "en-US", cfg.Units, localeCache, ttlCache, func(format string, args ...any) {
		logInfo(logger, "providers/twc", format, args...)
	})
	backgrounds := NewBackgroundManager(publicDir)
	vocalLocalService, err := vocallocal.NewService(publicDir)
	if err != nil {
		return err
	}

	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Recover())
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			err := next(c)
			logInfo(logger, "server/http", "HTTP %s %s %d", c.Request().Method, c.Request().URL.Path, c.Response().Status)
			return err
		}
	})

	e.GET("/config/keys", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]any{"twcApiKey": twcAPIKey, "mapboxToken": mapboxToken})
	})
	e.GET("/heartbeat", func(c echo.Context) error {
		c.Response().Header().Set("Cache-Control", "no-store")
		return c.JSON(http.StatusOK, map[string]string{"status": "ok", "timestamp": time.Now().Format(time.RFC3339)})
	})
	e.HEAD("/heartbeat", func(c echo.Context) error {
		c.Response().Header().Set("Cache-Control", "no-store")
		return c.NoContent(http.StatusOK)
	})
	e.GET("/data", func(c echo.Context) error {
		return c.String(http.StatusOK, "ARE YOU HAVE STUPID??? YOU ARE SUPOSED TO AD PARAMTER LIKE /data/MEMPHOS?loctype=primary!!!!!")
	})
	e.GET("/data/alerts/:location", func(c echo.Context) error {
		if !twcEnabled {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "TWC_API_KEY is not configured"})
		}
		location := c.Param("location")
		localeData, err := twc.LoadLocaleData(c.Request().Context(), location)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Error fetching alert data"})
		}
		geocode := fmt.Sprintf("%v,%v", localeData.Lat, localeData.Lon)
		alertData, statusCode, err := twc.FetchAlertSingleLocation(c.Request().Context(), geocode, "")
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Error fetching alert data"})
		}
		if statusCode == http.StatusNoContent {
			return c.String(http.StatusNoContent, "No active alerts for the requested location.")
		}
		return c.JSON(http.StatusOK, alertData)
	})
	e.GET("/data/:location", func(c echo.Context) error {
		if !twcEnabled {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "TWC_API_KEY is not configured"})
		}
		location := c.Param("location")
		locType := c.QueryParam("locType")
		logInfo(logger, "server/api", "GET request from client: %s and fetching for location type as %s", c.Path(), locType)
		requestContext := c.Request().Context()
		if strings.Contains(location, "|") || strings.Contains(location, ";") {
			delimiter := "|"
			if strings.Contains(location, ";") {
				delimiter = ";"
			}
			parts := strings.Split(location, delimiter)
			combined := make([]map[string]any, 0, len(parts))
			for _, part := range parts {
				localeData, err := twc.LoadLocaleData(requestContext, strings.TrimSpace(part))
				if err != nil {
					return c.String(http.StatusInternalServerError, err.Error())
				}
				geocode := fmt.Sprintf("%v,%v", localeData.Lat, localeData.Lon)
				resolvedLocType := locType
				if resolvedLocType == "" {
					resolvedLocType = "primary"
				}
				wxData, err := twc.LoadWeatherData(requestContext, localeData.PostalKey, geocode, resolvedLocType)
				if err != nil {
					return c.String(http.StatusInternalServerError, err.Error())
				}
				combined = append(combined, map[string]any{"localeData": localeData, "wxData": wxData})
			}
			return c.JSON(http.StatusOK, combined)
		}
		localeData, err := twc.LoadLocaleData(requestContext, location)
		if err != nil {
			return c.String(http.StatusInternalServerError, err.Error())
		}
		if locType == "" {
			return c.JSON(http.StatusBadRequest, map[string]any{"error": true, "comment": "Please add a locType query"})
		}
		geocode := fmt.Sprintf("%v,%v", localeData.Lat, localeData.Lon)
		wxData, err := twc.LoadWeatherData(requestContext, localeData.PostalKey, geocode, locType)
		if err != nil {
			return c.String(http.StatusInternalServerError, err.Error())
		}
		return c.JSON(http.StatusOK, map[string]any{
			"metadata": map[string]any{"localeData": localeData, "units": cfg.Units, "hdsLocType": locType},
			"weather":  wxData,
		})
	})
	e.POST("/backgrounds/init", func(c echo.Context) error {
		payload, err := io.ReadAll(c.Request().Body)
		if err != nil {
			return c.String(http.StatusBadRequest, "Invalid body")
		}
		wxCond := "wxgood"
		body := strings.TrimSpace(string(payload))
		if len(body) >= 2 && strings.HasPrefix(body, "[") && strings.HasSuffix(body, "]") {
			wxCond = body[1 : len(body)-1]
		}
		initialized := backgrounds.InitializedCondition()
		if initialized != "" && initialized == wxCond {
			return c.String(http.StatusOK, "Backgrounds are already initialized with weather condition: "+initialized)
		}
		if ok := backgrounds.Init(wxCond); !ok {
			return c.String(http.StatusNotFound, "No valid backgrounds found for weather condition: "+wxCond)
		}
		return c.String(http.StatusOK, "Initialized/re-initialized local backgrounds with weather condition: "+wxCond)
	})
	e.GET("/backgrounds/image", func(c echo.Context) error {
		selected := backgrounds.CurrentImage()
		if selected == "" {
			return c.String(http.StatusNoContent, "Background image not initialized.")
		}
		absolutePath := filepath.Join(publicDir, filepath.FromSlash(strings.TrimPrefix(selected, "/")))
		if !isPathInPublicDir(publicDir, absolutePath) {
			return c.String(http.StatusBadRequest, "Invalid background image path.")
		}
		if !fileExists(absolutePath) {
			return c.String(http.StatusNotFound, "No valid background image files available for current condition.")
		}
		return c.File(absolutePath)
	})
	e.GET("/bing-background", func(c echo.Context) error {
		request, err := http.NewRequestWithContext(c.Request().Context(), http.MethodGet, "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US", nil)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		response, err := client.Do(request)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		defer response.Body.Close()
		var payload any
		if err := jsonDecode(response, &payload); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		logInfo(logger, "server/api", "Client requested Bing background image")
		return c.JSON(http.StatusOK, payload)
	})
	e.POST("/vocallocal/clips", func(c echo.Context) error {
		request := vocallocal.ClipRequest{}
		if err := c.Bind(&request); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		}
		response, err := vocalLocalService.EnsureClips(c.Request().Context(), request)
		if err != nil {
			message := err.Error()
			if strings.Contains(message, "text is empty") || strings.Contains(message, "unknown section") || strings.Contains(message, "unknown phrase key") {
				return c.JSON(http.StatusBadRequest, map[string]string{"error": message})
			}
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": message})
		}
		return c.JSON(http.StatusOK, response)
	})
	e.File("/", filepath.Join(publicDir, "index.html"))
	e.Static("/persistentCache", filepath.Join(workspaceDir, "persistentCache"))
	e.Static("/", publicDir)

	port := cfg.WebPort
	for {
		listener, listenErr := net.Listen("tcp", ":"+strconv.Itoa(port))
		if listenErr != nil {
			if isAddrInUse(listenErr) {
				logInfo(logger, "server", "Port %d is already in use, trying %d", port, port+1)
				port++
				continue
			}
			return listenErr
		}
		logInfo(logger, "server", "HTTP server listening on http://localhost:%d", port)
		httpServer := &http.Server{Handler: e, ReadHeaderTimeout: 10 * time.Second}
		go func() {
			<-ctx.Done()
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			_ = httpServer.Shutdown(shutdownCtx)
		}()
		return httpServer.Serve(listener)
	}
}

func loadConfigFromEnv() AppConfig {
	cfg := AppConfig{Units: "m", WebPort: 3000, CacheValidTime: 720}
	if value := strings.TrimSpace(os.Getenv("UNITS")); value != "" {
		cfg.Units = value
	}
	if value := strings.TrimSpace(os.Getenv("WEB_PORT")); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
			cfg.WebPort = parsed
		}
	}
	if value := strings.TrimSpace(os.Getenv("CACHE_VALID_TIME")); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
			cfg.CacheValidTime = parsed
		}
	}
	if value := strings.TrimSpace(os.Getenv("PORT")); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
			cfg.WebPort = parsed
		}
	}
	return cfg
}

func jsonDecode(response *http.Response, target any) error {
	return json.NewDecoder(response.Body).Decode(target)
}

func isAddrInUse(err error) bool {
	if errors.Is(err, syscall.EADDRINUSE) {
		return true
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "address already in use") || strings.Contains(message, "only one usage of each socket address")
}
