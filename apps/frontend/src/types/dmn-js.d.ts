// Type declarations for dmn-js

declare module 'dmn-js/lib/Modeler' {
  interface DmnJSView {
    type: 'drd' | 'decisionTable' | 'literalExpression';
    element?: unknown;
  }

  interface DmnJSCanvas {
    zoom(level?: number | 'fit-viewport'): number;
    viewbox(box?: { x: number; y: number; width: number; height: number }): {
      x: number;
      y: number;
      width: number;
      height: number;
      inner: { x: number; y: number; width: number; height: number };
      outer: { width: number; height: number };
    };
  }

  interface DmnJSActiveViewer {
    get(name: 'canvas'): DmnJSCanvas;
    get(name: string): unknown;
  }

  interface DmnJSOptions {
    container?: HTMLElement | string;
    keyboard?: { bindTo?: HTMLElement | Document };
    drd?: {
      additionalModules?: unknown[];
    };
    decisionTable?: {
      additionalModules?: unknown[];
    };
    literalExpression?: {
      additionalModules?: unknown[];
    };
  }

  interface DmnJSSaveXMLOptions {
    format?: boolean;
  }

  interface DmnJSSaveXMLResult {
    xml: string;
  }

  class DmnJS {
    constructor(options?: DmnJSOptions);

    importXML(xml: string): Promise<{ warnings: string[] }>;
    saveXML(options?: DmnJSSaveXMLOptions): Promise<DmnJSSaveXMLResult>;

    getViews(): DmnJSView[];
    open(view: DmnJSView): void;
    getActiveViewer(): DmnJSActiveViewer | null;

    on(event: string, callback: (...args: unknown[]) => void): void;
    off(event: string, callback?: (...args: unknown[]) => void): void;

    destroy(): void;
  }

  export default DmnJS;
}

// CSS modules
declare module 'dmn-js/dist/assets/diagram-js.css';
declare module 'dmn-js/dist/assets/dmn-js-shared.css';
declare module 'dmn-js/dist/assets/dmn-js-drd.css';
declare module 'dmn-js/dist/assets/dmn-js-decision-table.css';
declare module 'dmn-js/dist/assets/dmn-js-literal-expression.css';
declare module 'dmn-js/dist/assets/dmn-font/css/dmn-embedded.css';
