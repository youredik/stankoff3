import { layoutProcess } from 'bpmn-auto-layout';

/**
 * Checks if BPMN XML has complete BPMNDI layout (edges with waypoints).
 * If layout is incomplete, auto-generates it using bpmn-auto-layout.
 */
export async function ensureBpmnLayout(xml: string): Promise<string> {
  const hasSequenceFlows = xml.includes('sequenceFlow');
  const hasEdges = xml.includes('BPMNEdge');

  // If there are sequence flows but no edges — layout is missing
  if (hasSequenceFlows && !hasEdges) {
    try {
      return await layoutProcess(xml);
    } catch (err) {
      console.warn('bpmn-auto-layout failed, using original XML:', err);
      return xml;
    }
  }

  return xml;
}
