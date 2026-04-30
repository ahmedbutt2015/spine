package transport

type Transport struct{}

func Open() *Transport {
	return &Transport{}
}
