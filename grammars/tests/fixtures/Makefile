# Build a deck
OUTPUT := build
.PHONY: all clean
all: $(OUTPUT)/deck.html
$(OUTPUT)/deck.html: deck.mdx
	mkdir -p $(OUTPUT)
	bun run compile $<
clean:
	rm -f $(OUTPUT)/deck.html
