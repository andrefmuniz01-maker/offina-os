import { isDemoWorkspace } from "@/lib/demoWorkspace";
import InventoryDemo from "./InventoryDemo";
import InventoryLegacy from "./InventoryLegacy";

export default function InventoryRoute() {
  return isDemoWorkspace() ? <InventoryDemo /> : <InventoryLegacy />;
}
