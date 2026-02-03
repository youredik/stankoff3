# Keycloak Theme - Stankoff Portal

Кастомная тема для Keycloak в стиле корпоративного портала Stankoff с бирюзовыми акцентами.

## Дизайн

Тема соответствует корпоративному стилю Stankoff Portal:

- **Основной цвет:** #06b6d4 (бирюзовый)
- **Шрифт:** Inter
- **Стиль:** Минималистичный, современный
- **Адаптивность:** Полностью responsive дизайн
- **Локализация:** Поддержка русского и английского языков

## Структура

```
keycloak-theme/
└── stankoff-portal/
    └── login/
        ├── theme.properties          # Конфигурация темы
        ├── resources/
        │   └── css/
        │       └── login.css        # Стили в корпоративном стиле
        └── messages/
            └── messages_ru.properties # Русская локализация
```

## Установка

### Вариант 1: Через Admin Console (рекомендуется)

1. Зайти в Keycloak Admin Console: https://new.stankoff.ru/oidc/admin
2. Выбрать realm `stankoff-preprod`
3. Перейти в **Realm Settings** → **Themes**
4. В разделе **Login Theme** выбрать `stankoff-portal`
5. Нажать **Save**

### Вариант 2: Загрузка JAR файла

1. Создать JAR архив темы:
   ```bash
   cd keycloak-theme
   jar -cvf stankoff-portal-theme.jar -C stankoff-portal .
   ```

2. Загрузить JAR в Keycloak через Admin Console:
   - Перейти в **Realm Settings** → **Themes**
   - Нажать **Import theme**
   - Выбрать `stankoff-portal-theme.jar`

### Вариант 3: Копирование в Keycloak директорию (для standalone Keycloak)

1. Скопировать папку `stankoff-portal` в директорию themes Keycloak:
   ```bash
   cp -r stankoff-portal /path/to/keycloak/themes/
   ```

2. Перезапустить Keycloak:
   ```bash
   /path/to/keycloak/bin/kc.sh start
   ```

3. В Admin Console выбрать тему для realm `stankoff-preprod`

## Применение темы к realm

### ⚠️ ВАЖНО: Не применять к realm `stankoff`!

Realm `stankoff` используется для другого проекта и **НЕ ДОЛЖЕН** изменяться.

### Для realm `stankoff-preprod`:

1. Зайти в Keycloak Admin Console
2. Выбрать realm **stankoff-preprod** (не stankoff!)
3. Перейти в **Realm Settings** → **Themes**
4. Настроить темы:
   - **Login Theme:** `stankoff-portal`
   - **Account Theme:** `stankoff-portal` (опционально)
   - **Email Theme:** `stankoff-portal` (опционально)
   - **Admin Console Theme:** оставить по умолчанию
5. Нажать **Save**

## Проверка

После применения темы:

1. Открыть страницу логина: https://preprod.stankoff.ru/login
2. Вы должны увидеть:
   - Бирюзовые акценты
   - Шрифт Inter
   - Минималистичный дизайн карточки
   - Русский интерфейс по умолчанию

## Кастомизация

### Изменение цветов

Отредактировать файл `login/resources/css/login.css`:

```css
:root {
  --primary: #06b6d4;        /* Основной цвет */
  --primary-hover: #0891b2;  /* Hover состояние */
  --primary-light: #22d3ee;  /* Светлый акцент */
}
```

### Добавление логотипа

1. Добавить логотип в `login/resources/img/logo.png`
2. Обновить CSS для отображения логотипа:

```css
#kc-header-wrapper::before {
  content: "";
  display: block;
  width: 120px;
  height: 40px;
  margin: 0 auto 1rem;
  background: url('../img/logo.png') no-repeat center;
  background-size: contain;
}
```

### Изменение переводов

Отредактировать `login/messages/messages_ru.properties`:

```properties
loginTitle=Ваш кастомный заголовок
```

## Troubleshooting

### Тема не отображается

1. Проверить что тема выбрана для правильного realm (`stankoff-preprod`, не `stankoff`)
2. Очистить кэш браузера (Ctrl+Shift+R)
3. Проверить логи Keycloak на наличие ошибок
4. Перезапустить Keycloak (если это standalone версия)

### Стили не применяются

1. Проверить путь к CSS файлу в `theme.properties`
2. Убедиться что `login.css` находится в `resources/css/`
3. Проверить синтаксис CSS на наличие ошибок

### Русский язык не работает

1. Убедиться что в `theme.properties` указано: `locales=ru,en`
2. Проверить что файл `messages_ru.properties` в кодировке ISO-8859-1 или UTF-8 с BOM
3. В realm settings установить **Internationalization** → **Enabled**
4. Добавить `ru` в **Supported Locales**

## Автоматический деплой темы (рекомендуется)

### Вариант 1: SSH деплой скрипт

**Самый удобный способ** - автоматический деплой через SSH:

1. Отредактируйте `deploy.sh`:
   ```bash
   KEYCLOAK_HOST="new.stankoff.ru"           # Адрес Keycloak сервера
   KEYCLOAK_USER="youredik"                  # SSH пользователь
   KEYCLOAK_THEMES_DIR="/opt/keycloak/themes" # Путь к themes директории
   ```

2. Запустите скрипт:
   ```bash
   cd keycloak-theme
   ./deploy.sh
   ```

3. Скрипт автоматически:
   - Создаст JAR архив
   - Скопирует тему на Keycloak сервер через rsync
   - Предложит перезапустить Keycloak

**Теперь при любых изменениях** просто запускайте `./deploy.sh` - тема обновится автоматически!

### Вариант 2: Docker volume (если Keycloak в Docker)

Если Keycloak запущен в Docker контейнере, можно примонтировать директорию с темой:

```yaml
# docker-compose.yml или docker run
services:
  keycloak:
    volumes:
      - ./keycloak-theme/stankoff-portal:/opt/keycloak/themes/stankoff-portal:ro
```

При этом изменения в теме будут применяться автоматически (может потребоваться перезапуск).

### Вариант 3: Hot reload (development)

Для разработки можно включить hot reload в Keycloak:

```bash
# Запустить Keycloak в development режиме
kc.sh start-dev --spi-theme-static-max-age=-1 --spi-theme-cache-themes=false
```

При изменении CSS/HTML изменения применятся после обновления страницы (F5).

## Обновление темы (ручной способ)

Если не используете автоматический деплой:

1. Внести изменения в файлы темы
2. Пересобрать JAR файл:
   ```bash
   cd keycloak-theme
   jar -cvf stankoff-portal-theme.jar -C stankoff-portal .
   ```
3. Загрузить в Keycloak Admin Console (Realm Settings → Themes → Import)
4. Или скопировать на сервер вручную через scp
5. Очистить кэш браузера (Ctrl+Shift+R)

## Дополнительная информация

- [Keycloak Server Developer Guide - Themes](https://www.keycloak.org/docs/latest/server_development/#_themes)
- [Keycloak Theme Properties](https://www.keycloak.org/docs/latest/server_development/#theme-properties)

## Поддержка

При возникновении проблем обращайтесь к:
- Документации проекта: `/docs/ARCHITECTURE.md`
- Email: support@stankoff.ru
