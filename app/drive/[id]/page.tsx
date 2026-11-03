import DriveBrowser from './drive-browser';

export const instant = false;

export default async function DrivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DriveBrowser workspaceId={id} />;
}
