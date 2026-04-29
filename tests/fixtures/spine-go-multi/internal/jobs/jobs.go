package jobs

import (
	"example.com/multi/internal/store"
)

func Run() {
	_ = store.New()
}
