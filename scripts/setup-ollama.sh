#!/bin/bash
# Скрипт настройки Ollama с необходимыми моделями
#
# Запуск:
#   ./scripts/setup-ollama.sh
#
# Модели:
#   - nomic-embed-text: мультиязычные embeddings (768 dims, 274MB)
#   - qwen2.5:14b: LLM с хорошей поддержкой русского (9GB)
#   - llama3.1:8b: быстрая LLM альтернатива (4.7GB)

set -e

echo "🚀 Настройка Ollama для Stankoff Portal..."

# Проверяем, запущен ли Docker
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker не запущен. Пожалуйста, запустите Docker."
    exit 1
fi

# Запускаем Ollama контейнер
echo "📦 Запуск Ollama контейнера..."
docker compose -f docker-compose.ollama.yml up -d

# Ждём пока Ollama будет готов
echo "⏳ Ожидание готовности Ollama..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "✅ Ollama готов!"
        break
    fi
    attempt=$((attempt + 1))
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ Ollama не запустился. Проверьте логи: docker logs stankoff-ollama"
    exit 1
fi

# Загружаем модели
echo ""
echo "📥 Загрузка модели nomic-embed-text (embeddings, 274MB)..."
docker compose -f docker-compose.ollama.yml exec -T ollama ollama pull nomic-embed-text

echo ""
echo "📥 Загрузка модели qwen2.5:14b (LLM, 9GB)..."
echo "   Это может занять несколько минут..."
docker compose -f docker-compose.ollama.yml exec -T ollama ollama pull qwen2.5:14b

# Опционально: загружаем быструю альтернативу
read -p "Хотите загрузить дополнительную модель llama3.1:8b (4.7GB)? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📥 Загрузка модели llama3.1:8b..."
    docker compose -f docker-compose.ollama.yml exec -T ollama ollama pull llama3.1:8b
fi

echo ""
echo "✅ Ollama настроен!"
echo ""
echo "📋 Доступные модели:"
docker compose -f docker-compose.ollama.yml exec -T ollama ollama list
echo ""
echo "🔧 Добавьте в .env:"
echo "   OLLAMA_BASE_URL=http://localhost:11434"
echo "   OLLAMA_MODEL=qwen2.5:14b"
echo "   OLLAMA_EMBEDDING_MODEL=nomic-embed-text"
echo "   AI_LLM_PRIORITY=yandex,ollama,openai"
echo "   AI_EMBEDDING_PRIORITY=ollama,openai"
echo ""
echo "🚀 Теперь можете запустить backend: npm run dev:backend"
