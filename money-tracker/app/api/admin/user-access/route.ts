import { getAuthUser } from '@/lib/auth';
import { setUserDisabled } from '@/lib/db';

// POST /api/admin/user-access  body: { role: 'wife'|'husband', disabled: true|false }
// Only husband can call this.
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'husband') return Response.json({ error: '남편만 접근 권한을 변경할 수 있습니다' }, { status: 403 });

  const { role, disabled } = await request.json();
  if (!['husband', 'wife'].includes(role) || typeof disabled !== 'boolean') {
    return Response.json({ error: 'role(husband|wife) 과 disabled(boolean) 이 필요합니다' }, { status: 400 });
  }
  if (role === 'husband') {
    return Response.json({ error: '자기 자신의 접근을 막을 수 없습니다' }, { status: 400 });
  }

  await setUserDisabled(role, disabled);
  return Response.json({ ok: true, role, disabled });
}
