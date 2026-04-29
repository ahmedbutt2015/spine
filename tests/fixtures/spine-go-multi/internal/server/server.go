package server

import (
	"example.com/multi/internal/store"
)

func Start() {
	_ = store.New()
}
