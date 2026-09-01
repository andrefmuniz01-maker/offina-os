import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getPeriodRange, navigatePeriod, startOfDay, type PeriodView } from "@/lib/periodRange";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

export function PeriodPicker({ view, onViewChange, anchor, onAnchorChange }: {
  view: PeriodView;
  onViewChange: (view: PeriodView) => void;
  anchor: Date;
  onAnchorChange: (date: Date) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const range = getPeriodRange(view, anchor);
  const viewLabels: Record<PeriodView, string> = { day: "Dia", week: "Semana", month: "Mês" };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1">
        {(["day", "week", "month"] as const).map(option => (
          <Button key={option} type="button" size="sm" variant={view === option ? "default" : "outline"} onClick={() => onViewChange(option)}>{viewLabels[option]}</Button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" size="icon" variant="outline" onClick={() => onAnchorChange(navigatePeriod(view, anchor, -1))} aria-label="Período anterior"><ChevronLeft className="h-4 w-4" /></Button>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild><Button type="button" size="sm" variant="outline" className="min-w-36 justify-start"><CalendarIcon className="mr-1.5 h-3.5 w-3.5" />{range.label}</Button></PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={anchor} onSelect={date => { if (date) { onAnchorChange(startOfDay(date)); setPickerOpen(false); } }} />
          </PopoverContent>
        </Popover>
        <Button type="button" size="icon" variant="outline" onClick={() => onAnchorChange(navigatePeriod(view, anchor, 1))} aria-label="Próximo período"><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <Button type="button" size="sm" variant="ghost" onClick={() => onAnchorChange(startOfDay(new Date()))}>Hoje</Button>
    </div>
  );
}
