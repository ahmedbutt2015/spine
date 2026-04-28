package main

import (
	"example.com/spine-go/config"
	"example.com/spine-go/routes"
)

func main() {
	_ = config.Mode
	routes.Router()
}

