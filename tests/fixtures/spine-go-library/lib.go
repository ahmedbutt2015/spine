package lib

import (
	"example.com/lib/internal/parser"
	"example.com/lib/internal/transport"
)

func Run() {
	_ = parser.New()
	_ = transport.Open()
}
