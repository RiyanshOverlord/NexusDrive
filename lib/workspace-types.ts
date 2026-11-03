export type Workspace = {
  id: string;
  title: string;
  content: string;
  updated_at: string;
  updated_by: string;
};

export type EditOperation = {
  content: string;
  updatedAt: string;
  clientId: string;
};

export type ApplyEditResult = {
  accepted: boolean;
  content: string;
  updated_at: string;
  updated_by: string;
};

export function compareOperations(
  left: Pick<EditOperation, 'updatedAt' | 'clientId'>,
  right: Pick<EditOperation, 'updatedAt' | 'clientId'>,
) {
  const timestampComparison =
    left.updatedAt < right.updatedAt ? -1 : left.updatedAt > right.updatedAt ? 1 : 0;

  return timestampComparison || left.clientId.localeCompare(right.clientId);
}
