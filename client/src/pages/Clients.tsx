import { isDemoWorkspace } from "@/lib/demoWorkspace";
import ClientsDemo from "./ClientsDemo";
import ClientsLegacy from "./ClientsLegacy";

export default function ClientsRoute() {
  return isDemoWorkspace() ? <ClientsDemo /> : <ClientsLegacy />;
}
