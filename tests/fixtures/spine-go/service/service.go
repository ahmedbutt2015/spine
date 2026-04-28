package service

import "example.com/spine-go/store"

func Load() string {
	return store.Fetch()
}

