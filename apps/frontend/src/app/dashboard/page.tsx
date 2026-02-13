import { redirect } from 'next/navigation';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const params = await searchParams;
  if (params.entity) {
    redirect(`/workspace?entity=${params.entity}`);
  }
  redirect('/workspace');
}
