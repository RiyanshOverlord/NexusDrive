import WorkspaceRoom from './workspace-room';

export const instant = false;

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkspaceRoom workspaceId={id} />;
}
