import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSupabaseServiceRoleClient } from "../_core/supabase";
import { publicProcedure, router } from "../_core/trpc";
import { parsePublicQuoteDecision, parsePublicQuoteView } from "./supabaseQuoteContract";

const tokenInput = z.object({ token: z.string().trim().min(32).max(128) });
const PDF_SIGNED_URL_TTL_SECONDS = 300;

export const supabasePublicQuoteRouter = router({
  view: publicProcedure.input(tokenInput).query(async ({ input }) => {
    const supabase = createSupabaseServiceRoleClient();
    if (!supabase) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível consultar esta proposta agora." });

    const { data, error } = await supabase.rpc("public_quote_view", { token_input: input.token });
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível consultar esta proposta agora." });
    if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Proposta indisponível." });

    const result = parsePublicQuoteView(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível consultar esta proposta agora." });

    const { pdfStorageKey, ...quoteWithoutPdfKey } = result.data.quote;
    let pdfUrl: string | null = null;
    if (pdfStorageKey) {
      const { data: signed } = await supabase.storage.from("quote-proposals").createSignedUrl(pdfStorageKey, PDF_SIGNED_URL_TTL_SECONDS);
      pdfUrl = signed?.signedUrl ?? null;
    }
    return { ...result.data, quote: { ...quoteWithoutPdfKey, pdfUrl } };
  }),

  decide: publicProcedure.input(tokenInput.extend({ decision: z.enum(["approved", "rejected"]) })).mutation(async ({ input }) => {
    const supabase = createSupabaseServiceRoleClient();
    if (!supabase) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível registrar sua decisão agora." });

    const { data, error } = await supabase.rpc("public_decide_quote", { token_input: input.token, decision_input: input.decision });
    if (error?.code === "P0001") throw new TRPCError({ code: "CONFLICT", message: "A disponibilidade foi alterada. Fale com a oficina para revisar a proposta." });
    if (error || !data) throw new TRPCError({ code: "NOT_FOUND", message: "Proposta indisponível." });

    const result = parsePublicQuoteDecision(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível registrar sua decisão agora." });
    return result.data;
  }),
});
