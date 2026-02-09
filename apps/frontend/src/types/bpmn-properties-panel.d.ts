declare module 'bpmn-js-properties-panel' {
  const BpmnPropertiesPanelModule: Record<string, unknown>;
  const BpmnPropertiesProviderModule: Record<string, unknown>;
  const ZeebePropertiesProviderModule: Record<string, unknown>;
  const CamundaPlatformPropertiesProviderModule: Record<string, unknown>;
  function useService(type: string, strict?: boolean): any;
  export {
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    ZeebePropertiesProviderModule,
    CamundaPlatformPropertiesProviderModule,
    useService,
  };
}

declare module '@bpmn-io/properties-panel' {
  interface EntryProps {
    element: any;
    id: string;
    label?: string;
    description?: string;
    disabled?: boolean;
    tooltip?: string;
  }

  interface SelectEntryProps extends EntryProps {
    getValue: (element?: any) => string;
    setValue: (value: string) => void;
    getOptions: (element?: any) => Array<{ value: string; label: string }>;
    validate?: (value: string) => string | null;
  }

  function SelectEntry(props: SelectEntryProps): any;
  function isSelectEntryEdited(node: HTMLElement): boolean;
  function isTextFieldEntryEdited(node: HTMLElement): boolean;

  export {
    SelectEntry,
    isSelectEntryEdited,
    isTextFieldEntryEdited,
  };
}

declare module 'zeebe-bpmn-moddle/resources/zeebe.json' {
  const zeebeModdle: Record<string, unknown>;
  export default zeebeModdle;
}

declare module 'camunda-bpmn-js-behaviors/lib/camunda-cloud' {
  const camundaCloudBehaviors: Record<string, unknown>;
  export default camundaCloudBehaviors;
}

declare module '@bpmn-io/properties-panel/dist/assets/properties-panel.css';
