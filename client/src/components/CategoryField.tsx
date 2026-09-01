import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useState } from "react";

const NEW_CATEGORY_VALUE = "__new__";

export function CategoryField({ id, label, value, onChange, options, loading, onCreate, creating }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: number; name: string }> | undefined;
  loading: boolean;
  onCreate: (name: string) => Promise<{ id: number } | void>;
  creating: boolean;
}) {
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState("");

  const handleSelect = (next: string) => {
    if (next === NEW_CATEGORY_VALUE) {
      setCreatingNew(true);
      return;
    }
    onChange(next);
  };

  const confirmCreate = async () => {
    if (newName.trim().length < 2) return;
    const result = await onCreate(newName.trim());
    setNewName("");
    setCreatingNew(false);
    if (result && "id" in result) onChange(String(result.id));
  };

  if (creatingNew) {
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex gap-2">
          <Input id={id} autoFocus value={newName} onChange={event => setNewName(event.target.value)} placeholder="Nome da nova categoria" onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); confirmCreate(); } }} />
          <Button type="button" size="sm" disabled={creating || newName.trim().length < 2} onClick={confirmCreate}>{creating ? "Criando…" : "Criar"}</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => { setCreatingNew(false); setNewName(""); }}>Cancelar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={handleSelect}>
        <SelectTrigger id={id}><SelectValue placeholder={loading ? "Carregando categorias…" : "Sem categoria"} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sem categoria</SelectItem>
          {options?.map(category => <SelectItem key={category.id} value={String(category.id)}>{category.name}</SelectItem>)}
          <SelectItem value={NEW_CATEGORY_VALUE}><span className="flex items-center gap-1.5 text-orange-700"><Plus className="h-3.5 w-3.5" />Nova categoria…</span></SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
