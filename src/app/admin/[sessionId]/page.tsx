import AdminRecoveryClient from '@/app/components/admin/AdminRecoveryClient';

export default async function AdminSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <AdminRecoveryClient sessionId={sessionId} />;
}
