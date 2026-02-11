import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix user task elementName values that show technical BPMN element IDs
 * (e.g. "Task_Register") instead of human-readable names (e.g. "Регистрация рекламации").
 *
 * Reads BPMN XML from process_definitions and extracts the name attribute
 * for each user task element, then updates matching user_tasks records.
 */
export class FixUserTaskElementNames1772200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Find all user_tasks where elementName equals elementId (i.e. name was not resolved)
    const tasksToFix = await queryRunner.query(`
      SELECT DISTINCT ut."elementId", ut."processInstanceId", pi."processDefinitionId"
      FROM user_tasks ut
      JOIN process_instances pi ON pi.id = ut."processInstanceId"
      WHERE ut."elementName" = ut."elementId"
    `);

    if (tasksToFix.length === 0) return;

    // Cache definitions to avoid re-reading
    const definitionCache = new Map<string, string | null>();

    for (const row of tasksToFix) {
      const { elementId, processDefinitionId } = row;

      let bpmnXml: string | null;
      if (definitionCache.has(processDefinitionId)) {
        bpmnXml = definitionCache.get(processDefinitionId) ?? null;
      } else {
        const defs = await queryRunner.query(
          `SELECT "bpmnXml" FROM process_definitions WHERE id = $1`,
          [processDefinitionId],
        );
        bpmnXml = defs[0]?.bpmnXml || null;
        definitionCache.set(processDefinitionId, bpmnXml);
      }

      if (!bpmnXml) continue;

      // Extract name attribute from the BPMN element with this ID
      const escapedId = elementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const elementRegex = new RegExp(
        `<[^>]*\\bid="${escapedId}"[^>]*>`,
        's',
      );
      const elementMatch = bpmnXml.match(elementRegex);
      if (!elementMatch) continue;

      const nameMatch = elementMatch[0].match(/\bname="([^"]*)"/);
      if (!nameMatch || nameMatch[1] === elementId) continue;

      const resolvedName = nameMatch[1];

      // Update all user_tasks for this definition + elementId
      await queryRunner.query(
        `UPDATE user_tasks
         SET "elementName" = $1
         WHERE "elementId" = $2
           AND "elementName" = $2
           AND "processInstanceId" IN (
             SELECT id FROM process_instances WHERE "processDefinitionId" = $3
           )`,
        [resolvedName, elementId, processDefinitionId],
      );
    }
  }

  public async down(): Promise<void> {
    // No rollback — the old values (technical IDs) are not useful
  }
}
