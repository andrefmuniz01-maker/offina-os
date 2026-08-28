import { isDemoWorkspace } from "@/lib/demoWorkspace";
import PurchasesDemo from "./PurchasesDemo";
import PurchasesLegacy from "./PurchasesLegacy";

export default function PurchasesRoute() {
  return isDemoWorkspace() ? <PurchasesDemo /> : <PurchasesLegacy />;
}
