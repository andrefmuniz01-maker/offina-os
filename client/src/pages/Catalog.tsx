import { isDemoWorkspace } from "@/lib/demoWorkspace";
import CatalogDemo from "./CatalogDemo";
import CatalogLegacy from "./CatalogLegacy";

export default function CatalogRoute() {
  return isDemoWorkspace() ? <CatalogDemo /> : <CatalogLegacy />;
}
