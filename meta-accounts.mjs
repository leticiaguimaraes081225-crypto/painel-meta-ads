import { sessionFromRequest } from "./_meta.mjs";

export default async request => {
  const session = sessionFromRequest(request);
  if (!session?.accessToken) return Response.json({ connected: false, accounts: [] }, { status: 401 });
  try {
    const fields = "id,name,account_status,currency,amount_spent,balance";
    const response = await fetch(`https://graph.facebook.com/v24.0/me/adaccounts?fields=${encodeURIComponent(fields)}&limit=100&access_token=${encodeURIComponent(session.accessToken)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "Erro ao consultar contas.");
    const accounts = (result.data || []).map(account => ({ id: account.id, name: account.name, status: account.account_status === 1 ? "Ativa" : "Inativa", currency: account.currency || "BRL", spent: Number(account.amount_spent || 0) / 100, balance: Number(account.balance || 0) / 100 }));
    return Response.json({ connected: true, accounts });
  } catch (error) { return Response.json({ connected: false, error: error.message, accounts: [] }, { status: 500 }); }
};
