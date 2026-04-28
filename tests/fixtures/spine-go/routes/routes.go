package routes

import "example.com/spine-go/service"

func Router() string {
	return service.Load()
}

