/**
 * Custom bpmn-js properties provider that replaces the "Custom form key"
 * text input with a dropdown (SelectEntry) populated with workspace form definitions.
 *
 * Architecture: React.MutableRefObject bridge pattern.
 * - React side: fetches forms via API, stores in a ref
 * - bpmn-js side: reads ref.current at render time to populate options
 */

import { useService } from 'bpmn-js-properties-panel';
import { SelectEntry, isSelectEntryEdited } from '@bpmn-io/properties-panel';

export interface FormOption {
  key: string;
  name: string;
}

// Runs after ZeebePropertiesProvider (500) to override its entries
const PROVIDER_PRIORITY = 400;

interface PropertiesPanel {
  registerProvider(priority: number, provider: unknown): void;
}

interface GroupEntry {
  id: string;
  component: (props: { element: unknown }) => unknown;
  isEdited?: (node: HTMLElement) => boolean;
}

interface PropertiesGroup {
  id: string;
  entries: GroupEntry[];
}

/**
 * Creates a bpmn-js DI module that provides form key dropdown.
 * @param formsRef - React ref containing current workspace form definitions
 */
export function createFormKeyProviderModule(
  formsRef: { current: FormOption[] },
) {
  class FormKeyPropertiesProvider {
    static $inject = ['propertiesPanel', 'injector'];

    constructor(propertiesPanel: PropertiesPanel) {
      propertiesPanel.registerProvider(PROVIDER_PRIORITY, this);
    }

    getGroups(element: unknown) {
      return (groups: PropertiesGroup[]) => {
        // Only replace if we have forms to offer
        if (formsRef.current.length === 0) return groups;

        const formGroup = groups.find((g) => g.id === 'form');
        if (!formGroup) return groups;

        formGroup.entries = formGroup.entries.map((entry) => {
          if (entry.id === 'customFormKey') {
            return {
              id: 'customFormKey',
              component: CustomFormKeySelect,
              isEdited: isSelectEntryEdited,
            };
          }
          return entry;
        });

        return groups;
      };
    }
  }

  /**
   * Preact component rendered inside bpmn-js properties panel.
   * Replaces TextFieldEntry with SelectEntry for form key selection.
   */
  function CustomFormKeySelect(props: { element: any }) {
    const { element } = props;
    const injector: any = useService('injector');
    const translate: (s: string) => string = useService('translate');

    const getValue = () => {
      const bo = element.businessObject || element;
      const extElements = bo.extensionElements;
      if (!extElements) return '';
      const formDefs = (extElements.values || []).filter(
        (e: any) => e.$type === 'zeebe:FormDefinition',
      );
      return formDefs[0]?.formKey || '';
    };

    const setValue = (value: string) => {
      const bo = element.businessObject || element;
      const extElements = bo.extensionElements;
      if (!extElements) return;
      const formDefs = (extElements.values || []).filter(
        (e: any) => e.$type === 'zeebe:FormDefinition',
      );
      const formDefinition = formDefs[0];
      if (!formDefinition) return;

      const commandStack = injector.get('commandStack');
      commandStack.execute('element.updateModdleProperties', {
        element,
        moddleElement: formDefinition,
        properties: { formKey: value || '' },
      });
    };

    const getOptions = () => {
      const options: Array<{ value: string; label: string }> = [
        { value: '', label: translate('Select form...') },
      ];
      for (const form of formsRef.current) {
        options.push({ value: form.key, label: `${form.name} (${form.key})` });
      }
      return options;
    };

    return SelectEntry({
      element,
      id: 'customFormKey',
      label: translate('Custom form key'),
      getValue,
      setValue,
      getOptions,
    });
  }

  return {
    __init__: ['formKeyPropertiesProvider'],
    formKeyPropertiesProvider: ['type', FormKeyPropertiesProvider],
  };
}
