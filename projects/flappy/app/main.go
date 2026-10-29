//go:build windows

// Family Flappy — native Windows wrapper.
//
// The game itself is an HTML5 canvas game (../game). It is embedded into this
// executable and shown in a native window through Microsoft Edge WebView2,
// which ships with Windows 11. Player data (custom pictures, best score,
// settings) is stored as small files in %APPDATA%\FamilyFlappy\data.
package main

import (
	"embed"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sync"
	"syscall"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
)

//go:embed all:web
var webFS embed.FS

var (
	user32               = syscall.NewLazyDLL("user32.dll")
	procMessageBoxW      = user32.NewProc("MessageBoxW")
	procGetWindowLongPtr = user32.NewProc("GetWindowLongPtrW")
	procSetWindowLongPtr = user32.NewProc("SetWindowLongPtrW")
	procSetWindowPos     = user32.NewProc("SetWindowPos")
	procMonitorFromWnd   = user32.NewProc("MonitorFromWindow")
	procGetMonitorInfo   = user32.NewProc("GetMonitorInfoW")
	procGetWindowRect    = user32.NewProc("GetWindowRect")
	procShowWindow       = user32.NewProc("ShowWindow")
)

const (
	gwlStyle          = -16
	wsOverlappedWnd   = 0x00CF0000
	wsPopup           = 0x80000000
	wsVisible         = 0x10000000
	swpNoZOrder       = 0x0004
	swpFrameChanged   = 0x0020
	swpNoOwnerZOrder  = 0x0200
	monitorDefNearest = 2
	swMaximize        = 3
)

type rect struct{ Left, Top, Right, Bottom int32 }
type monitorInfo struct {
	CbSize    uint32
	RcMonitor rect
	RcWork    rect
	DwFlags   uint32
}

func messageBox(title, text string) {
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(text)
	procMessageBoxW.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x40)
}

// ---------- tiny key/value store on disk ----------
var keyRe = regexp.MustCompile(`^[a-zA-Z0-9_\-]{1,64}$`)

type store struct {
	dir string
	mu  sync.Mutex
}

func (s *store) path(k string) string { return filepath.Join(s.dir, k+".txt") }

func (s *store) Set(k, v string) bool {
	if !keyRe.MatchString(k) || len(v) > 12<<20 {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	tmp := s.path(k) + ".tmp"
	if err := os.WriteFile(tmp, []byte(v), 0o644); err != nil {
		return false
	}
	return os.Rename(tmp, s.path(k)) == nil
}

func (s *store) Del(k string) bool {
	if !keyRe.MatchString(k) {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	err := os.Remove(s.path(k))
	return err == nil || os.IsNotExist(err)
}

func (s *store) All() map[string]string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := map[string]string{}
	entries, _ := os.ReadDir(s.dir)
	for _, e := range entries {
		n := e.Name()
		if e.IsDir() || filepath.Ext(n) != ".txt" {
			continue
		}
		k := n[:len(n)-4]
		if !keyRe.MatchString(k) {
			continue
		}
		if b, err := os.ReadFile(filepath.Join(s.dir, n)); err == nil {
			out[k] = string(b)
		}
	}
	return out
}

// ---------- full screen toggle (borderless, covers the monitor) ----------
type fullscreen struct {
	on        bool
	prevStyle uintptr
	prevRect  rect
}

func (f *fullscreen) set(hwnd uintptr, on bool) {
	if on == f.on || hwnd == 0 {
		return
	}
	if on {
		s, _, _ := procGetWindowLongPtr.Call(hwnd, toIdx(gwlStyle))
		f.prevStyle = s
		procGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&f.prevRect)))
		mon, _, _ := procMonitorFromWnd.Call(hwnd, monitorDefNearest)
		mi := monitorInfo{CbSize: uint32(unsafe.Sizeof(monitorInfo{}))}
		procGetMonitorInfo.Call(mon, uintptr(unsafe.Pointer(&mi)))
		procSetWindowLongPtr.Call(hwnd, toIdx(gwlStyle), (s&^wsOverlappedWnd)|wsPopup|wsVisible)
		r := mi.RcMonitor
		procSetWindowPos.Call(hwnd, 0, uintptr(r.Left), uintptr(r.Top), uintptr(r.Right-r.Left), uintptr(r.Bottom-r.Top),
			swpNoZOrder|swpNoOwnerZOrder|swpFrameChanged)
	} else {
		procSetWindowLongPtr.Call(hwnd, toIdx(gwlStyle), f.prevStyle)
		r := f.prevRect
		procSetWindowPos.Call(hwnd, 0, uintptr(r.Left), uintptr(r.Top), uintptr(r.Right-r.Left), uintptr(r.Bottom-r.Top),
			swpNoZOrder|swpNoOwnerZOrder|swpFrameChanged)
	}
	f.on = on
}

func toIdx(i int) uintptr { return uintptr(int64(i)) }

func main() {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		appData = os.TempDir()
	}
	base := filepath.Join(appData, "FamilyFlappy")
	st := &store{dir: filepath.Join(base, "data")}
	_ = os.MkdirAll(st.dir, 0o755)

	// Serve the embedded game on a private loopback port.
	sub, err := fs.Sub(webFS, "web")
	if err != nil {
		messageBox("Family Flappy", "Game files are missing: "+err.Error())
		return
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		messageBox("Family Flappy", "Could not start: "+err.Error())
		return
	}
	mux := http.NewServeMux()
	fileServer := http.FileServer(http.FS(sub))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		fileServer.ServeHTTP(w, r)
	}))
	go http.Serve(ln, mux)
	url := "http://" + ln.Addr().String() + "/index.html?app=1"

	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		localAppData = base
	}
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		DataPath:  filepath.Join(localAppData, "FamilyFlappy", "WebView2"),
		WindowOptions: webview2.WindowOptions{
			Title:  "Family Flappy",
			Width:  1280,
			Height: 760,
			IconId: 2, // rsrc: 1 = manifest, 2 = icon group (see tools/build.sh)
			Center: true,
		},
	})
	if w == nil {
		// WebView2 runtime missing (very rare on Windows 11): fall back to the default browser.
		exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
		messageBox("Family Flappy", "Family Flappy opened in your web browser.\n\nKeep this message open while you play; press OK to quit.\n\n(To play in its own window, install the free Microsoft Edge WebView2 Runtime.)")
		return
	}
	defer w.Destroy()

	hwnd := uintptr(w.Window())
	fsc := &fullscreen{}

	w.Bind("ffStoreAll", func() map[string]string { return st.All() })
	w.Bind("ffStoreSet", func(k, v string) bool { return st.Set(k, v) })
	w.Bind("ffStoreDel", func(k string) bool { return st.Del(k) })
	w.Bind("ffFullscreen", func(on bool) bool {
		w.Dispatch(func() { fsc.set(hwnd, on) })
		return on
	})
	w.Bind("ffQuit", func() {
		w.Dispatch(func() { w.Terminate() })
	})

	w.Navigate(url)
	w.Run()
}
