//go:build !ffmpeg || !cgo

package music

import "fmt"

func isNativeAudioExtension(string) bool {
	return false
}

func unsupportedLibraryMessage() string {
	return "No supported Opus/Ogg files found in ./Music"
}

func (s *Service) playNativeTrack(track Track) error {
	return fmt.Errorf("native FFmpeg audio backend is not enabled for %s", track.path)
}
