PACK_PATH = "dock-ng@ochi12.github.com.zip"
EXTENSION_DIR = "dock-ng@ochi12.github.com"

EXTRAS = dockNG.js dockManager.js

all: build install

.PHONY: build install clean

build:
	rm -f $(PACK_PATH)
	cd $(EXTENSION_DIR); \
	gnome-extensions pack \
		$(foreach f, $(EXTRAS), --extra-source=$(f)); \
	mv $(EXTENSION_DIR).shell-extension.zip ../$(PACK_PATH)

install:
	gnome-extensions install $(PACK_PATH) --force

clean:
	@rm -fv $(PACK_PATH)

