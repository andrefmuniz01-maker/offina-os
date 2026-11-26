import { Button } from "@/components/ui/button";
import { formatDuration, formatShopDateTime, formatSlotDay, formatSlotDayLong } from "@/lib/scheduling";
import { trpc } from "@/lib/trpc";
import { CalendarCheck, CalendarX, CircleAlert, Clock, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRoute } from "wouter";

type Booked = { scheduledStart: string; scheduledEnd: string };

/**
 * Página que o cliente abre pelo link de WhatsApp (ou logo depois de aprovar a proposta):
 * mostra os dias e horários livres da oficina e agenda com um toque. Sem login, sem cadastro.
 */
export default function PublicScheduling() {
  const [, params] = useRoute("/agendar/:token");
  const token = params?.token ?? "";
  const info = trpc.publicQuotes.schedulingInfo.useQuery({ token }, { enabled: Boolean(token), retry: false });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);
  const book = trpc.publicQuotes.book.useMutation({
    onSuccess: result => setBooked({ scheduledStart: result.scheduledStart, scheduledEnd: result.scheduledEnd }),
    onError: error => {
      // Horário ocupado por outra pessoa no meio tempo: recarrega a lista e pede outra escolha.
      if (error.data?.code === "CONFLICT") { setSelectedStart(null); void info.refetch(); }
    },
  });

  const days = info.data?.state === "open" ? info.data.days : [];
  useEffect(() => {
    if (!selectedDate && days.length) setSelectedDate(days[0].date);
  }, [days, selectedDate]);

  if (info.isLoading) {
    return <Shell><div className="flex items-center justify-center gap-3 py-24 text-sm text-slate-600" role="status"><Loader2 className="h-5 w-5 animate-spin text-orange-700" aria-hidden="true" /><span>Carregando horários…</span></div></Shell>;
  }
  if (!info.data) {
    return <Shell><Notice icon={<CircleAlert className="h-7 w-7 text-red-700" aria-hidden="true" />} title="Agendamento indisponível" text={info.error?.message ?? "Este link não está disponível. Fale com a oficina para combinar o horário."} /></Shell>;
  }

  const data = info.data;
  const confirmed: Booked | null = booked ?? (data.state === "scheduled" ? { scheduledStart: data.scheduledStart, scheduledEnd: data.scheduledEnd } : null);
  if (confirmed) {
    const start = formatShopDateTime(confirmed.scheduledStart);
    const end = formatShopDateTime(confirmed.scheduledEnd);
    return <Shell workshop={data.workshopName}>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center sm:p-8">
        <CalendarCheck className="mx-auto h-9 w-9 text-emerald-700" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Horário confirmado</h1>
        <p className="mt-4 text-lg font-medium text-slate-900 first-letter:uppercase">{start.day}</p>
        <p className="text-3xl font-semibold tabular-nums text-slate-950">{start.time}</p>
        <p className="mt-4 text-sm leading-6 text-slate-600">Leve o {data.vehicleName || "veículo"} à {data.workshopName} neste horário. Previsão de término: {end.time}.</p>
      </div>
      <p className="mt-5 text-center text-sm text-slate-500">Precisa mudar o horário? Fale com a oficina.</p>
    </Shell>;
  }

  const day = days.find(entry => entry.date === selectedDate) ?? days[0];
  const selectedSlot = day?.slots.find(slot => slot.start === selectedStart) ?? null;
  const durationMinutes = data.state === "open" ? data.durationMinutes : 0;

  return <Shell workshop={data.workshopName}>
    <header>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Escolha o melhor horário</h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
        <span>Proposta #{String(data.quoteNumber).padStart(6, "0")}{data.vehicleName ? ` · ${data.vehicleName}` : ""}</span>
        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />Serviço de cerca de {formatDuration(durationMinutes)}</span>
      </p>
    </header>

    {!days.length ? <div className="mt-8"><Notice icon={<CalendarX className="h-7 w-7 text-slate-500" aria-hidden="true" />} title="Sem horários livres agora" text="Não há horários disponíveis nos próximos dias. Fale com a oficina para combinar uma data." /></div> : <>
      <section className="mt-7" aria-label="Dias disponíveis">
        <h2 className="text-sm font-medium text-slate-700">Dia</h2>
        <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-2" role="group" aria-label="Escolha o dia">
          {days.map(entry => {
            const active = entry.date === day?.date;
            const [weekday, date] = formatSlotDay(entry.date).split(", ");
            return <button key={entry.date} type="button" aria-pressed={active} onClick={() => { setSelectedDate(entry.date); setSelectedStart(null); }}
              className={`flex min-w-[4.5rem] shrink-0 flex-col items-center rounded-xl border px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${active ? "border-orange-600 bg-orange-600 text-white" : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"}`}>
              <span className={`text-xs capitalize ${active ? "text-orange-100" : "text-slate-500"}`}>{weekday}</span>
              <span className="font-semibold tabular-nums">{date}</span>
            </button>;
          })}
        </div>
      </section>

      <section className="mt-5" aria-label="Horários disponíveis">
        <h2 className="text-sm font-medium text-slate-700">Horário de chegada</h2>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Escolha o horário">
          {day?.slots.map(slot => {
            const active = slot.start === selectedStart;
            return <button key={slot.start} type="button" aria-pressed={active} onClick={() => setSelectedStart(slot.start)}
              className={`rounded-xl border px-3 py-3 text-base font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${active ? "border-orange-600 bg-orange-600 text-white" : "border-slate-200 bg-white text-slate-900 hover:border-orange-400"}`}>
              {slot.label}
            </button>;
          })}
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 mt-8 border-t border-slate-200 bg-stone-50/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        {selectedSlot && day ? <p className="mb-3 text-sm text-slate-700 first-letter:uppercase">{formatSlotDayLong(day.date)} · chegada às {selectedSlot.label}</p> : null}
        {book.error ? <p className="mb-3 text-sm text-red-700" role="alert">{book.error.data?.code === "CONFLICT" || book.error.data?.code === "NOT_FOUND" ? book.error.message : "Não foi possível agendar agora. Tente novamente em instantes."}</p> : null}
        <Button size="lg" className="h-12 w-full text-base sm:w-auto sm:min-w-72" disabled={!selectedSlot || book.isPending} onClick={() => selectedSlot && book.mutate({ token, slotStart: selectedSlot.start })}>
          {book.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {selectedSlot && day ? `Confirmar ${formatSlotDay(day.date)} às ${selectedSlot.label}` : "Escolha um horário"}
        </Button>
      </div>
    </>}
  </Shell>;
}

function Shell({ children, workshop }: { children: React.ReactNode; workshop?: string }) {
  return <main className="min-h-screen bg-stone-50 px-4 py-8 sm:py-12">
    <div className="mx-auto max-w-2xl">
      {workshop ? <p className="mb-6 text-sm font-medium text-slate-500">{workshop}</p> : null}
      {children}
    </div>
  </main>;
}

function Notice({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center" role="alert">
    <div className="flex justify-center">{icon}</div>
    <h1 className="mt-3 text-xl font-semibold text-slate-950">{title}</h1>
    <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
  </div>;
}
