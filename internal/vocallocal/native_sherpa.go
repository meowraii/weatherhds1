//go:build native_tts && cgo && ((windows && (amd64 || 386)) || (darwin && (amd64 || arm64)) || (linux && (amd64 || arm64 || arm || 386 || mips || mips64 || mips64le || mipsle)))

package vocallocal

import (
	"context"
	"fmt"
	"runtime"
	"sync"

	sherpa "github.com/k2-fsa/sherpa-onnx-go/sherpa_onnx"
)

var nativePiperMu sync.Mutex
var nativePiperEngines = map[string]*nativePiperEngine{}

type nativePiperEngine struct {
	mu     sync.Mutex
	engine *sherpa.OfflineTts
}

func nativePiperSynthesize(ctx context.Context, req nativePiperRequest) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	engine, err := nativePiperEngineFor(req)
	if err != nil {
		return nil, err
	}
	engine.mu.Lock()
	generated := engine.engine.GenerateWithConfig(req.Text, &sherpa.GenerationConfig{
		Speed:        nativePiperSpeed(req.Rate),
		SilenceScale: 0.2,
	}, nil)
	engine.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if generated == nil || len(generated.Samples) == 0 {
		return nil, fmt.Errorf("native piper generated no audio")
	}
	generated.Samples = applyVolume(generated.Samples, req.Volume)
	wav := generated.ToBuffer()
	if len(wav) == 0 {
		return nil, fmt.Errorf("native piper failed to encode WAV")
	}
	return wav, nil
}

func nativePiperEngineFor(req nativePiperRequest) (*nativePiperEngine, error) {
	key := req.ModelPath + "\x00" + req.ConfigPath + "\x00" + req.DataDir + "\x00" + nativePiperProvider()
	nativePiperMu.Lock()
	if engine := nativePiperEngines[key]; engine != nil {
		nativePiperMu.Unlock()
		return engine, nil
	}
	nativePiperMu.Unlock()

	config, err := loadPiperVoiceConfig(req.ConfigPath)
	if err != nil {
		return nil, err
	}
	tokensPath, err := ensurePiperTokensFile(req.ConfigPath, config)
	if err != nil {
		return nil, err
	}
	debug := 0
	if envOrDefault("WHDS_PIPER_DEBUG", "") == "1" {
		debug = 1
	}
	offline := sherpa.OfflineTtsConfig{
		Model: sherpa.OfflineTtsModelConfig{
			Vits: sherpa.OfflineTtsVitsModelConfig{
				Model:       req.ModelPath,
				Tokens:      tokensPath,
				DataDir:     req.DataDir,
				NoiseScale:  config.Inference.NoiseScale,
				NoiseScaleW: config.Inference.NoiseW,
				LengthScale: config.Inference.LengthScale,
			},
			NumThreads: nativePiperThreads(),
			Debug:      debug,
			Provider:   nativePiperProvider(),
		},
		MaxNumSentences: 1,
		SilenceScale:    0.2,
	}
	sherpaEngine := sherpa.NewOfflineTts(&offline)
	if sherpaEngine == nil {
		return nil, fmt.Errorf("failed to initialize native piper runtime")
	}
	engine := &nativePiperEngine{engine: sherpaEngine}
	runtime.SetFinalizer(engine, func(engine *nativePiperEngine) {
		engine.close()
	})

	nativePiperMu.Lock()
	if existing := nativePiperEngines[key]; existing != nil {
		nativePiperMu.Unlock()
		engine.close()
		return existing, nil
	}
	nativePiperEngines[key] = engine
	nativePiperMu.Unlock()
	return engine, nil
}

func (e *nativePiperEngine) close() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.engine != nil {
		sherpa.DeleteOfflineTts(e.engine)
		e.engine = nil
	}
}
