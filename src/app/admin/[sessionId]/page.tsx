import AdminRecoveryClient from '@/app/components/admin/AdminRecoveryClient';
import { useParams } from '@/lib/navigation';

export default function AdminSessionPage() {
  const { sessionId = '' } = useParams();
  return <AdminRecoveryClient sessionId={sessionId} />;
}
