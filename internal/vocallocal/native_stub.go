//go:build !native_tts || !cgo || (!windows && !darwin && !linux) || (windows && !amd64 && !386) || (darwin && !amd64 && !arm64) || (linux && !amd64 && !arm64 && !arm && !386 && !mips && !mips64 && !mips64le && !mipsle)

package vocallocal

import "context"

func nativePiperSynthesize(context.Context, nativePiperRequest) ([]byte, error) {
	return nil, errNativePiperUnavailable
}
