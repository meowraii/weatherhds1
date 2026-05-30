package main

import (
	"context"
	"log"

	"weatherhds/internal/server"
)

func main() {
	if err := server.Run(context.Background()); err != nil {
		log.Fatal(err)
	}
}
