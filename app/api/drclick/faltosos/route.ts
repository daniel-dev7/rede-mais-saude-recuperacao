import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function error(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  // No browser-accessible Dr Click credentials; authenticated operators only.
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) return error("Autenticação necessária.", 401);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return error("Supabase não configurado.", 503);

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return error("Sessão inválida.", 401);
  const { data: operator, error: roleError } = await supabase.from("operator_profiles")
    .select("active,role").eq("user_id", user.id).maybeSingle();
  if (roleError || !operator?.active || !["admin", "operator"].includes(operator.role))
    return error("Usuário sem acesso à Central.", 403);

  const date = request.nextUrl.searchParams.get("date");
  const clinic = request.nextUrl.searchParams.get("idclinica");
  if (!date || !datePattern.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z")) ||
      new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date)
    return error("Informe uma data válida no formato YYYY-MM-DD.", 400);
  if (!clinic || !uuidPattern.test(clinic)) return error("idclinica inválido.", 400);

  const authorizedClinics = (process.env.DRCLICK_CLINIC_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!authorizedClinics.includes(clinic)) return error("Clínica não autorizada.", 403);

  const base = process.env.DRCLICK_API_BASE_URL;
  if (!base) return error("Endereço da API Dr Click não configurado.", 503);
  let upstream: URL;
  try {
    upstream = new URL("/api/bots/appointmentbystatus", base);
    if (upstream.protocol !== "https:" || upstream.username || upstream.password) throw Error("invalid");
  } catch {
    return error("Configuração de endereço Dr Click inválida.", 503);
  }
  upstream.searchParams.set("start_date", date);
  upstream.searchParams.set("end_date", date);
  upstream.searchParams.set("status", "faltou");
  upstream.searchParams.set("idclinica", clinic);

  // The PDF does not specify an authentication scheme. Configure the exact
  // approved header name and value only after Dr Click provides credentials.
  const headerName = process.env.DRCLICK_AUTH_HEADER_NAME;
  const headerValue = process.env.DRCLICK_AUTH_HEADER_VALUE;
  const headers = new Headers({ Accept: "application/json" });
  if (headerName && headerValue) {
    try { headers.set(headerName, headerValue); }
    catch { return error("Cabeçalho de autenticação inválido.", 503); }
  } else if (headerName || headerValue) {
    return error("Credenciais Dr Click incompletas.", 503);
  }

  try {
    const response = await fetch(upstream.toString(), {
      headers, cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return error("Falha na consulta Dr Click.", 502);
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("success" in result) ||
        (result as {success: unknown}).success !== true) return error("A API Dr Click retornou uma falha.", 502);
    const appointments = (result as {data?: {analytic_results_appointments?: unknown}}).data?.analytic_results_appointments;
    if (!Array.isArray(appointments)) return error("Formato da resposta Dr Click inesperado.", 502);

    const seen = new Set<string>();
    const records = appointments.filter(row => {
      if (!row || typeof row !== "object" || row.status !== "faltou" || typeof row.idagendamento !== "string" ||
          seen.has(row.idagendamento)) return false;
      seen.add(row.idagendamento);
      return true;
    }).map(row => ({
      idagendamento: row.idagendamento,
      patient_id: row.patient_id,
      patient_name: row.patient_name,
      patient_phone: typeof row.patient_phone === "string" && row.patient_phone.trim().toUpperCase() !== "S/N"
        ? row.patient_phone.trim() : null,
      scheduled_date: row.scheduled_date,
      professional_name: row.professional_name,
      item_name: row.item_name,
      health_plan: row.health_plan,
      clinica: row.clinica,
      amount: row.amount,
      amount_paid: row.amount_paid,
      status: row.status,
    }));
    return NextResponse.json({ success: true, date, idclinica: clinic, total: records.length, records },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return error("Não foi possível consultar a Dr Click. Verifique liberação de IP, credenciais e conectividade.", 502);
  }
}
