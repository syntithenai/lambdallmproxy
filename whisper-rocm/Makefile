# Makefile for Whisper ROCm OpenAI API

.PHONY: help build start stop restart logs test clean check-gpu

help: ## Show this help message
	@echo "Whisper ROCm OpenAI API - Available commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""

check-gpu: ## Check GPU architecture
	@echo "Checking AMD GPU architecture..."
	@echo ""
	@if [ -d /sys/class/drm/card0/device ]; then \
		echo "AMD GPU detected:"; \
		cat /sys/class/drm/card0/device/uevent 2>/dev/null | grep PCI_ID || echo "  Device found but ID not readable"; \
		echo ""; \
		echo "To get full GPU info, either:"; \
		echo "  1. Install ROCm on host: sudo apt install rocminfo"; \
		echo "  2. Check inside container after build: make gpu-info"; \
		echo ""; \
		echo "Common GPU configurations:"; \
		echo "  - Radeon RX 5700/5700 XT (gfx1010): HSA_OVERRIDE_GFX_VERSION=10.1.0"; \
		echo "  - Radeon RX 6800/6900 (gfx1030): HSA_OVERRIDE_GFX_VERSION=10.3.0"; \
		echo "  - Radeon RX 7900 XTX (gfx1100): HSA_OVERRIDE_GFX_VERSION=11.0.0"; \
	else \
		echo "⚠️  No AMD GPU detected at /sys/class/drm/card0"; \
		echo ""; \
		echo "This could mean:"; \
		echo "  - No AMD GPU installed"; \
		echo "  - GPU is at different device path (card1, card2, etc.)"; \
		echo "  - Running in VM without GPU passthrough"; \
		echo ""; \
		echo "Check all GPUs: ls -l /dev/dri/"; \
	fi

build: ## Build Docker image
	@echo "Building Whisper ROCm Docker image..."
	@echo "This will take 30-60 minutes on first build..."
	docker compose -f ../docker-compose.whisper-rocm.yml build

start: ## Start the server
	docker compose -f ../docker-compose.whisper-rocm.yml up -d
	@echo ""
	@echo "✓ Server started at http://localhost:8000"
	@echo "  View logs: make logs"
	@echo "  Run tests: make test"

stop: ## Stop the server
	docker compose -f ../docker-compose.whisper-rocm.yml down

restart: stop start ## Restart the server

logs: ## View server logs
	docker compose -f ../docker-compose.whisper-rocm.yml logs -f

test: ## Test the API endpoints (Note: Use 'make test' from project root for Jest tests)
	@echo "⚠️  whisper-rocm/test-api.sh not found"
	@echo "📝 To run project tests, use 'make test' from the project root directory"
	@echo "🐳 To test whisper-rocm Docker container, use 'make run' and check logs"

clean: ## Remove containers and images
	docker compose -f ../docker-compose.whisper-rocm.yml down -v
	docker rmi whisper-rocm-openai 2>/dev/null || true

shell: ## Open shell in running container
	docker exec -it whisper-rocm-openai bash

gpu-info: ## Show GPU information
	docker exec -it whisper-rocm-openai rocm-smi

models: ## List downloaded models
	@echo "Downloaded models:"
	@ls -lh ../whisper-models/ 2>/dev/null || echo "No models downloaded yet"
