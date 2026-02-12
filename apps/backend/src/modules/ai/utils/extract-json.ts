/**
 * Извлекает JSON из ответа LLM, удаляя markdown-обёртку ```json ... ```
 *
 * YandexGPT (и некоторые другие модели) оборачивают JSON ответ в markdown
 * code blocks, даже когда промпт просит "только JSON без markdown".
 */
export function extractJson(text: string): string {
  const trimmed = text.trim();

  // Убираем ```json ... ``` или ``` ... ```
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (match) {
    return match[1].trim();
  }

  return trimmed;
}
