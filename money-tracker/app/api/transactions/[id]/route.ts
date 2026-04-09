import { deleteTransaction } from '@/lib/db';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id);

  if (isNaN(numId)) {
    return Response.json({ error: '잘못된 ID입니다' }, { status: 400 });
  }

  const success = deleteTransaction(numId);
  if (!success) {
    return Response.json({ error: '거래를 찾을 수 없습니다' }, { status: 404 });
  }

  return Response.json({ success: true });
}
