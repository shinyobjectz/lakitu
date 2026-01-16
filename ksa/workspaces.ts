/**
 * Workspaces KSA - Knowledge, Skills, and Abilities
 *
 * Create and manage design workspaces with canvas tools.
 * Workspaces contain frames, designs, and collaborative elements.
 *
 * @example
 * import { listWorkspaces, createWorkspace, getWorkspace } from './ksa/workspaces';
 *
 * // List all workspaces
 * const workspaces = await listWorkspaces();
 *
 * // Create a new workspace
 * const workspaceId = await createWorkspace('Brand Campaign Q1');
 *
 * // Get workspace details
 * const workspace = await getWorkspace(workspaceId);
 */

import { callGateway } from "./_shared/gateway";

// ============================================================================
// Types
// ============================================================================

export interface Workspace {
  _id: string;
  name: string;
  orgId: string;
  createdBy: string;
  canvas?: CanvasState;
  _creationTime: number;
}

export interface CanvasState {
  version: string;
  elements: CanvasElement[];
  connections: Connection[];
  viewport: {
    offset: { x: number; y: number };
    zoom: number;
  };
  settings?: Record<string, unknown>;
}

export interface CanvasElement {
  id: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  data: {
    nodeType: "frame" | "shape" | "text" | "image" | "group";
    label?: string;
    code?: string;
    codeType?: string;
    imageUrl?: string;
    frameId?: string;
  };
  style?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    borderRadius?: number;
    opacity?: number;
  };
}

export interface Connection {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  style?: {
    stroke?: string;
    strokeWidth?: number;
  };
}

export interface Design {
  _id: string;
  workspaceId: string;
  name: string;
  slug: string;
  elements: CanvasElement[];
  status: "draft" | "published" | "archived";
  _creationTime: number;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * List all workspaces.
 *
 * @param orgId - Optional organization ID to filter by
 * @returns Array of workspaces
 *
 * @example
 * const workspaces = await listWorkspaces();
 * for (const ws of workspaces) {
 *   console.log(`${ws.name} - ${ws.canvas?.elements.length || 0} elements`);
 * }
 */
export async function listWorkspaces(orgId?: string): Promise<Workspace[]> {
  const response = await callGateway<Workspace[]>(
    "features.workspaces.workspaces.list",
    { orgId },
    "query"
  );
  return response;
}

/**
 * Create a new workspace.
 *
 * @param name - Workspace name
 * @param orgId - Optional organization ID
 * @returns The new workspace ID
 *
 * @example
 * const workspaceId = await createWorkspace('Q1 Campaign Designs');
 */
export async function createWorkspace(name: string, orgId?: string): Promise<string> {
  const response = await callGateway<string>(
    "features.workspaces.workspaces.create",
    { name, orgId },
    "mutation"
  );
  return response;
}

/**
 * Get workspace details.
 *
 * @param workspaceId - The workspace ID
 * @returns Workspace with canvas state or null if not found
 *
 * @example
 * const workspace = await getWorkspace(workspaceId);
 * console.log(`Canvas has ${workspace.canvas?.elements.length} elements`);
 */
export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  try {
    const response = await callGateway<Workspace>(
      "features.workspaces.workspaces.get",
      { workspaceId },
      "query"
    );
    return response;
  } catch {
    return null;
  }
}

/**
 * Update workspace name.
 *
 * @param workspaceId - The workspace ID
 * @param name - New workspace name
 *
 * @example
 * await updateWorkspaceName(workspaceId, 'Rebranded Workspace');
 */
export async function updateWorkspaceName(workspaceId: string, name: string): Promise<void> {
  await callGateway(
    "features.workspaces.workspaces.updateName",
    { workspaceId, name },
    "mutation"
  );
}

/**
 * Delete a workspace.
 *
 * @param workspaceId - The workspace ID to delete
 *
 * @example
 * await deleteWorkspace(workspaceId);
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await callGateway(
    "features.workspaces.workspaces.remove",
    { workspaceId },
    "mutation"
  );
}

/**
 * Get the canvas state for a workspace.
 *
 * @param workspaceId - The workspace ID
 * @returns Canvas state or null
 *
 * @example
 * const canvas = await getCanvas(workspaceId);
 * for (const el of canvas?.elements || []) {
 *   console.log(`${el.data.nodeType}: ${el.data.label}`);
 * }
 */
export async function getCanvas(workspaceId: string): Promise<CanvasState | null> {
  try {
    const response = await callGateway<CanvasState>(
      "features.workspaces.canvas.get",
      { workspaceId },
      "query"
    );
    return response;
  } catch {
    return null;
  }
}

/**
 * Save/update the canvas state.
 *
 * @param workspaceId - The workspace ID
 * @param canvas - The canvas state to save
 *
 * @example
 * await saveCanvas(workspaceId, {
 *   version: '1.0',
 *   elements: [...],
 *   connections: [],
 *   viewport: { offset: { x: 0, y: 0 }, zoom: 1 }
 * });
 */
export async function saveCanvas(workspaceId: string, canvas: CanvasState): Promise<void> {
  await callGateway(
    "features.workspaces.canvas.save",
    { workspaceId, canvas },
    "mutation"
  );
}

/**
 * Add an element to the workspace canvas.
 *
 * @param workspaceId - The workspace ID
 * @param element - The element to add
 * @returns The element ID
 *
 * @example
 * const elementId = await addCanvasElement(workspaceId, {
 *   id: crypto.randomUUID(),
 *   position: { x: 100, y: 100 },
 *   size: { width: 400, height: 300 },
 *   data: {
 *     nodeType: 'frame',
 *     label: 'Hero Section',
 *     frameId: 'frame-123'
 *   }
 * });
 */
export async function addCanvasElement(
  workspaceId: string,
  element: CanvasElement
): Promise<string> {
  // Get current canvas
  const canvas = await getCanvas(workspaceId) || {
    version: "1.0",
    elements: [],
    connections: [],
    viewport: { offset: { x: 0, y: 0 }, zoom: 1 },
  };

  // Add element
  const elementId = element.id || crypto.randomUUID();
  canvas.elements.push({ ...element, id: elementId });

  // Save updated canvas
  await saveCanvas(workspaceId, canvas);

  return elementId;
}

/**
 * Remove an element from the canvas.
 *
 * @param workspaceId - The workspace ID
 * @param elementId - The element ID to remove
 *
 * @example
 * await removeCanvasElement(workspaceId, elementId);
 */
export async function removeCanvasElement(
  workspaceId: string,
  elementId: string
): Promise<void> {
  const canvas = await getCanvas(workspaceId);
  if (!canvas) return;

  canvas.elements = canvas.elements.filter((el) => el.id !== elementId);
  canvas.connections = canvas.connections.filter(
    (c) => c.source !== elementId && c.target !== elementId
  );

  await saveCanvas(workspaceId, canvas);
}

/**
 * Update an element's properties.
 *
 * @param workspaceId - The workspace ID
 * @param elementId - The element ID
 * @param updates - Properties to update
 *
 * @example
 * await updateCanvasElement(workspaceId, elementId, {
 *   position: { x: 200, y: 200 },
 *   data: { label: 'Updated Label' }
 * });
 */
export async function updateCanvasElement(
  workspaceId: string,
  elementId: string,
  updates: Partial<CanvasElement>
): Promise<void> {
  const canvas = await getCanvas(workspaceId);
  if (!canvas) return;

  const index = canvas.elements.findIndex((el) => el.id === elementId);
  if (index === -1) return;

  canvas.elements[index] = {
    ...canvas.elements[index],
    ...updates,
    data: {
      ...canvas.elements[index].data,
      ...updates.data,
    },
    style: {
      ...canvas.elements[index].style,
      ...updates.style,
    },
  };

  await saveCanvas(workspaceId, canvas);
}

/**
 * Add a connection between two elements.
 *
 * @param workspaceId - The workspace ID
 * @param connection - The connection to add
 * @returns The connection ID
 *
 * @example
 * const connId = await addConnection(workspaceId, {
 *   id: crypto.randomUUID(),
 *   source: 'element-1',
 *   target: 'element-2'
 * });
 */
export async function addConnection(
  workspaceId: string,
  connection: Connection
): Promise<string> {
  const canvas = await getCanvas(workspaceId);
  if (!canvas) throw new Error("Canvas not found");

  const connectionId = connection.id || crypto.randomUUID();
  canvas.connections.push({ ...connection, id: connectionId });

  await saveCanvas(workspaceId, canvas);

  return connectionId;
}

/**
 * List designs in a workspace.
 *
 * @param workspaceId - The workspace ID
 * @returns Array of designs
 *
 * @example
 * const designs = await listDesigns(workspaceId);
 */
export async function listDesigns(workspaceId: string): Promise<Design[]> {
  const response = await callGateway<Design[]>(
    "features.workspaces.designs.listDesigns",
    { workspaceId },
    "query"
  );
  return response;
}

/**
 * Save a design.
 *
 * @param workspaceId - The workspace ID
 * @param design - The design data
 * @returns The design ID
 *
 * @example
 * const designId = await saveDesign(workspaceId, {
 *   name: 'Homepage V1',
 *   slug: 'homepage-v1',
 *   elements: [...],
 *   status: 'draft'
 * });
 */
export async function saveDesign(
  workspaceId: string,
  design: Omit<Design, "_id" | "_creationTime" | "workspaceId">
): Promise<string> {
  const response = await callGateway<string>(
    "features.workspaces.designs.saveDesign",
    { workspaceId, ...design },
    "mutation"
  );
  return response;
}
