package music

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"
)

const (
	writeWait         = 10 * time.Second
	pongWait          = 60 * time.Second
	pingPeriod        = 45 * time.Second
	iceGrace          = 5 * time.Second
	sampleQueueLength = 24
	sampleQueueTarget = 4
)

type client struct {
	service *Service
	conn    *websocket.Conn
	send    chan []byte
	samples chan media.Sample

	mu    sync.RWMutex
	pc    *webrtc.PeerConnection
	track *webrtc.TrackLocalStaticSample
	once  sync.Once
}

type wsMessage struct {
	Type      string                     `json:"type"`
	SDP       *webrtc.SessionDescription `json:"sdp,omitempty"`
	Candidate *webrtc.ICECandidateInit   `json:"candidate,omitempty"`
}

func newClient(service *Service, conn *websocket.Conn) *client {
	return &client{
		service: service,
		conn:    conn,
		send:    make(chan []byte, 16),
		samples: make(chan media.Sample, sampleQueueLength),
	}
}

func (c *client) readPump() {
	defer c.service.unregister(c)
	c.conn.SetReadLimit(maxWSMessageBytes)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, payload, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var msg wsMessage
		if err := jsonUnmarshal(payload, &msg); err != nil {
			c.sendJSON(newErrorMessage("invalid message"))
			continue
		}
		c.handleMessage(msg)
	}
}

func (c *client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case payload, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *client) samplePump() {
	for sample := range c.samples {
		c.mu.RLock()
		track := c.track
		c.mu.RUnlock()
		if track == nil {
			continue
		}
		if err := track.WriteSample(sample); err != nil {
			c.service.logf("music sample write failed: %v", err)
			c.closePeer()
		}
	}
}

func (c *client) handleMessage(msg wsMessage) {
	switch msg.Type {
	case "hello":
		c.sendJSON(map[string]any{"type": "state", "state": c.service.State()})
	case "webrtc.offer":
		if msg.SDP == nil {
			c.sendJSON(newErrorMessage("missing offer"))
			return
		}
		if err := c.handleOffer(*msg.SDP); err != nil {
			c.sendJSON(newErrorMessage(err.Error()))
		}
	case "webrtc.ice":
		if msg.Candidate == nil {
			return
		}
		c.mu.RLock()
		pc := c.pc
		c.mu.RUnlock()
		if pc != nil {
			_ = pc.AddICECandidate(*msg.Candidate)
		}
	default:
		c.sendJSON(newErrorMessage("unsupported message type"))
	}
}

func (c *client) handleOffer(offer webrtc.SessionDescription) error {
	pc, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		return err
	}
	track, err := webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: opusClockRate, Channels: 2},
		"music",
		"weatherhds-music",
	)
	if err != nil {
		_ = pc.Close()
		return err
	}
	sender, err := pc.AddTrack(track)
	if err != nil {
		_ = pc.Close()
		return err
	}
	go func() {
		buffer := make([]byte, 1500)
		for {
			if _, _, err := sender.Read(buffer); err != nil {
				return
			}
		}
	}()
	pc.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate == nil {
			return
		}
		c.sendJSON(map[string]any{"type": "webrtc.ice", "candidate": candidate.ToJSON()})
	})
	pc.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		c.service.logf("webrtc connection state: %s", state.String())
		switch state {
		case webrtc.PeerConnectionStateFailed, webrtc.PeerConnectionStateClosed:
			c.closePeer()
		case webrtc.PeerConnectionStateDisconnected:
			go func(pc *webrtc.PeerConnection) {
				timer := time.NewTimer(iceGrace)
				defer timer.Stop()
				<-timer.C
				if pc.ConnectionState() == webrtc.PeerConnectionStateDisconnected {
					c.closePeerIfCurrent(pc)
				}
			}(pc)
		}
	})
	if err := pc.SetRemoteDescription(offer); err != nil {
		_ = pc.Close()
		return err
	}
	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		_ = pc.Close()
		return err
	}
	if err := pc.SetLocalDescription(answer); err != nil {
		_ = pc.Close()
		return err
	}

	c.closePeer()
	c.mu.Lock()
	c.pc = pc
	c.track = track
	c.mu.Unlock()
	c.sendJSON(map[string]any{"type": "webrtc.answer", "sdp": pc.LocalDescription()})
	return nil
}

func (c *client) writeSample(sample media.Sample) {
	defer func() {
		_ = recover()
	}()
	select {
	case c.samples <- sample:
		return
	default:
	}
drain:
	for len(c.samples) > sampleQueueTarget {
		select {
		case <-c.samples:
		default:
			break drain
		}
	}
	select {
	case c.samples <- sample:
	default:
	}
}

func (c *client) sendJSON(v any) {
	payload := jsonMarshal(v)
	defer func() {
		_ = recover()
	}()
	select {
	case c.send <- payload:
	default:
		c.close()
	}
}

func (c *client) closePeer() {
	c.mu.Lock()
	pc := c.pc
	c.pc = nil
	c.track = nil
	c.mu.Unlock()
	if pc != nil {
		_ = pc.Close()
	}
}

func (c *client) closePeerIfCurrent(pc *webrtc.PeerConnection) {
	c.mu.Lock()
	if c.pc != pc {
		c.mu.Unlock()
		return
	}
	c.pc = nil
	c.track = nil
	c.mu.Unlock()
	_ = pc.Close()
}

func (c *client) close() {
	c.once.Do(func() {
		c.closePeer()
		close(c.send)
		close(c.samples)
		_ = c.conn.Close()
	})
}
