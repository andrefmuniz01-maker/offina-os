import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSupabaseServiceRoleClient } from "../_core/supabase";
import { publicProcedure, router } from "../_core/trpc";
import { parsePublicQuoteView } from "./supabaseQuoteContract";

const tokenInput = z.object({ token: z.string().trim().min(32).max(128) });

export const supabasePublicQuoteRouter = router({
  view: publicProcedure.input(tokenInput).query(async ({ input }) => {
    const supabase = createSupabaseServiceRoleClient();
    if (!supabase) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível consultar esta proposta agora." });

    const { data, error } = await supabase.rpc("public_quote_view", { token_input: input.token });
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível consultar esta proposta agora." });
    if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Proposta indisponível." });

    const result = parsePublicQuoteView(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível consultar esta proposta agora." });
    return result.data;
  }),
});
