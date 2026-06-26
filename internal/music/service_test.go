package music

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media/oggwriter"
)

func TestNewServiceCreatesMissingMusicDir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "Music")
	service, err := NewService(dir, nil)
	if err != nil {
		t.Fatalf("NewService returned error: %v", err)
	}
	service.Close()

	tracks, unsupported := scanLibrary(dir)
	if len(tracks) != 0 {
		t.Fatalf("expected no tracks in new music dir, got %d", len(tracks))
	}
	if len(unsupported) != 0 {
		t.Fatalf("expected no unsupported files in new music dir, got %d", len(unsupported))
	}
}

func TestScanLibraryFindsOpusOggAndSkipsUnsupported(t *testing.T) {
	root := t.TempDir()
	nested := filepath.Join(root, "nested")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatalf("mkdirAll failed: %v", err)
	}

	writeTinyOgg(t, filepath.Join(nested, "sample.ogg"))
	if err := os.WriteFile(filepath.Join(root, "unsupported.mp3"), []byte("not decoded in v1"), 0o644); err != nil {
		t.Fatalf("write unsupported file failed: %v", err)
	}

	tracks, unsupported := scanLibrary(root)
	if len(tracks) != 1 {
		t.Fatalf("expected one supported track, got %d", len(tracks))
	}
	if tracks[0].Title != "sample" {
		t.Fatalf("expected filename title fallback, got %q", tracks[0].Title)
	}
	if len(unsupported) != 1 || !strings.HasSuffix(unsupported[0], "unsupported.mp3") {
		t.Fatalf("expected unsupported mp3 to be reported, got %#v", unsupported)
	}

	probed, err := probeTrack(root, tracks[0].path)
	if err != nil {
		t.Fatalf("probeTrack failed: %v", err)
	}
	if probed.Duration <= 0 {
		t.Fatalf("expected parsed duration, got %f", probed.Duration)
	}
}

func TestReadOggPacketsSplitsOpusPackets(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "sample.ogg")
	writeTinyOgg(t, path)

	file, err := os.Open(path)
	if err != nil {
		t.Fatalf("open tiny ogg failed: %v", err)
	}
	defer file.Close()

	var pending []byte
	var packets [][]byte
	for len(packets) < 3 {
		pagePackets, _, err := readOggPackets(file, &pending)
		if err != nil {
			t.Fatalf("readOggPackets failed: %v", err)
		}
		packets = append(packets, pagePackets...)
	}
	if string(packets[0][:8]) != "OpusHead" {
		t.Fatalf("first packet = %q, want OpusHead", string(packets[0][:8]))
	}
	if string(packets[1][:8]) != "OpusTags" {
		t.Fatalf("second packet = %q, want OpusTags", string(packets[1][:8]))
	}
	if len(packets[2]) == 0 {
		t.Fatal("expected at least one audio packet")
	}
}

func TestApplyTagsReadsCoverArtTags(t *testing.T) {
	payload := opusTagsPayload(map[string]string{
		"TITLE":        "Song",
		"COVERARTMIME": "image/png",
		"COVERART":     base64.StdEncoding.EncodeToString([]byte{0x89, 'P', 'N', 'G'}),
	})
	track := Track{}
	applyTags(&track, payload)

	if track.Title != "Song" {
		t.Fatalf("expected title tag, got %q", track.Title)
	}
	if track.artMime != "image/png" {
		t.Fatalf("expected image/png art mime, got %q", track.artMime)
	}
	if string(track.art) != string([]byte{0x89, 'P', 'N', 'G'}) {
		t.Fatalf("unexpected art bytes: %#v", track.art)
	}
}

func TestApplyTagsReadsMetadataBlockPicture(t *testing.T) {
	art := []byte{0xff, 0xd8, 0xff, 0xdb}
	payload := opusTagsPayload(map[string]string{
		"METADATA_BLOCK_PICTURE": metadataBlockPicture("image/jpeg", "cover", art),
	})
	track := Track{}
	applyTags(&track, payload)

	if track.artMime != "image/jpeg" {
		t.Fatalf("expected image/jpeg art mime, got %q", track.artMime)
	}
	if string(track.art) != string(art) {
		t.Fatalf("unexpected art bytes: %#v", track.art)
	}
}

func TestNextTrackAvoidsRepeatsBeforeDeckExhaustion(t *testing.T) {
	service := &Service{
		musicDir: t.TempDir(),
		rng:      rand.New(rand.NewSource(1)),
		deck:     []Track{{ID: "a"}, {ID: "b"}, {ID: "c"}},
	}

	seen := map[string]bool{}
	for range 3 {
		track, ok := service.nextTrack()
		if !ok {
			t.Fatal("expected deck track")
		}
		if seen[track.ID] {
			t.Fatalf("track repeated before deck exhausted: %s", track.ID)
		}
		seen[track.ID] = true
	}
	if _, ok := service.nextTrack(); ok {
		t.Fatal("expected no track after manual deck exhaustion and empty music dir")
	}
}

func TestSameOrigin(t *testing.T) {
	request := &http.Request{Host: "weather.local:8080", Header: make(http.Header)}
	if !sameOrigin(request) {
		t.Fatal("empty Origin should be allowed for non-browser clients")
	}
	request.Header.Set("Origin", "http://weather.local:8080")
	if !sameOrigin(request) {
		t.Fatal("matching http origin should be allowed")
	}
	request.Header.Set("Origin", "https://weather.local:8080")
	if !sameOrigin(request) {
		t.Fatal("matching https origin should be allowed")
	}
	request.Header.Set("Origin", "http://evil.local:8080")
	if sameOrigin(request) {
		t.Fatal("mismatched origin should be rejected")
	}
}

func TestJSONUnmarshalRejectsMalformedAndOversizedMessages(t *testing.T) {
	var msg wsMessage
	if err := jsonUnmarshal([]byte(`{"type":"hello"`), &msg); err == nil {
		t.Fatal("expected malformed JSON to be rejected")
	}
	if err := jsonUnmarshal(make([]byte, maxWSMessageBytes+1), &msg); err == nil {
		t.Fatal("expected oversized message to be rejected")
	}
}

func TestUnsupportedWebSocketMessageReturnsError(t *testing.T) {
	client := &client{
		service: &Service{},
		send:    make(chan []byte, 1),
	}
	client.handleMessage(wsMessage{Type: "pause"})

	var response struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(<-client.send, &response); err != nil {
		t.Fatalf("error response was not JSON: %v", err)
	}
	if response.Type != "error" || response.Message != "unsupported message type" {
		t.Fatalf("unexpected response: %#v", response)
	}
}

func TestHandleOfferCreatesWebRTCAnswer(t *testing.T) {
	peer, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatalf("NewPeerConnection failed: %v", err)
	}
	defer func() {
		_ = peer.Close()
	}()

	if _, err := peer.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio, webrtc.RTPTransceiverInit{
		Direction: webrtc.RTPTransceiverDirectionRecvonly,
	}); err != nil {
		t.Fatalf("AddTransceiverFromKind failed: %v", err)
	}
	offer, err := peer.CreateOffer(nil)
	if err != nil {
		t.Fatalf("CreateOffer failed: %v", err)
	}
	if err := peer.SetLocalDescription(offer); err != nil {
		t.Fatalf("SetLocalDescription failed: %v", err)
	}

	client := &client{
		service: &Service{},
		send:    make(chan []byte, 4),
	}
	defer client.closePeer()
	if err := client.handleOffer(*peer.LocalDescription()); err != nil {
		t.Fatalf("handleOffer failed: %v", err)
	}

	var response struct {
		Type string                     `json:"type"`
		SDP  *webrtc.SessionDescription `json:"sdp"`
	}
	if err := json.Unmarshal(<-client.send, &response); err != nil {
		t.Fatalf("answer response was not JSON: %v", err)
	}
	if response.Type != "webrtc.answer" || response.SDP == nil {
		t.Fatalf("unexpected answer response: %#v", response)
	}
	if response.SDP.Type != webrtc.SDPTypeAnswer {
		t.Fatalf("expected answer SDP, got %s", response.SDP.Type)
	}
	if err := peer.SetRemoteDescription(*response.SDP); err != nil {
		t.Fatalf("client-side SetRemoteDescription failed: %v", err)
	}
}

func TestTrackIDStableAndRelative(t *testing.T) {
	root := filepath.Join("D:", "Music")
	first := trackID(root, filepath.Join(root, "Album", "Song.ogg"))
	second := trackID(root, filepath.Join(root, "album", "song.ogg"))
	otherRoot := trackID(filepath.Join("D:", "Other"), filepath.Join(root, "Album", "Song.ogg"))

	if first != second {
		t.Fatal("track ID should be case-insensitive for the relative path")
	}
	if first == otherRoot {
		t.Fatal("track ID should be rooted to the configured music directory")
	}
}

func opusTagsPayload(comments map[string]string) []byte {
	payload := []byte("OpusTags")
	vendor := []byte("test")
	payload = binary.LittleEndian.AppendUint32(payload, uint32(len(vendor)))
	payload = append(payload, vendor...)
	payload = binary.LittleEndian.AppendUint32(payload, uint32(len(comments)))
	for key, value := range comments {
		comment := []byte(key + "=" + value)
		payload = binary.LittleEndian.AppendUint32(payload, uint32(len(comment)))
		payload = append(payload, comment...)
	}
	return payload
}

func metadataBlockPicture(mimeType string, description string, art []byte) string {
	raw := []byte{}
	raw = binary.BigEndian.AppendUint32(raw, 3)
	raw = binary.BigEndian.AppendUint32(raw, uint32(len(mimeType)))
	raw = append(raw, []byte(mimeType)...)
	raw = binary.BigEndian.AppendUint32(raw, uint32(len(description)))
	raw = append(raw, []byte(description)...)
	raw = binary.BigEndian.AppendUint32(raw, 0)
	raw = binary.BigEndian.AppendUint32(raw, 0)
	raw = binary.BigEndian.AppendUint32(raw, 0)
	raw = binary.BigEndian.AppendUint32(raw, 0)
	raw = binary.BigEndian.AppendUint32(raw, uint32(len(art)))
	raw = append(raw, art...)
	return base64.StdEncoding.EncodeToString(raw)
}

func writeTinyOgg(t *testing.T, path string) {
	t.Helper()
	writer, err := oggwriter.New(path, opusClockRate, 2)
	if err != nil {
		t.Fatalf("oggwriter.New failed: %v", err)
	}
	for i := range 4 {
		packet := &rtp.Packet{
			Header: rtp.Header{Timestamp: uint32(960 * (i + 1))},
			Payload: []byte{
				0xf8, 0xff, 0xfe,
			},
		}
		if err := writer.WriteRTP(packet); err != nil {
			t.Fatalf("WriteRTP failed: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("ogg writer close failed: %v", err)
	}
}
