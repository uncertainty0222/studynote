import { getAuthUser } from '@/lib/auth';
import { deletePersonalIncomeByMonth, deletePersonalExpensesByMonth } from '@/lib/db';

// DELETE /api/admin/delete-month?month=2026-03
export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month'); // e.g. "2026-03"

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: 'month 파라미터가 필요합니다 (형식: YYYY-MM)' }, { status: 400 });
  }

  const [deletedIncome, deletedExpenses] = await Promise.all([
    deletePersonalIncomeByMonth(month),
    deletePersonalExpensesByMonth(month),
  ]);

  return Response.json({ month, deletedIncome, deletedExpenses });
}
